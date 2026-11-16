#!/usr/bin/env node
/**
 * Export Building Overrides Script
 *
 * Reads internal review ledger (building-overrides-internal.json),
 * validates internal entries, removes private/confidential fields,
 * and generates public distribution files:
 *  - public/map/data/building-overrides.json
 *  - public/map/data/release-manifest.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDir = resolve(__dirname, '../public/map/data');

const internalPath = resolve(__dirname, '../data/building-overrides-internal.json');
const publicPath = resolve(baseDir, 'building-overrides.json');
const manifestPath = resolve(baseDir, 'release-manifest.json');

console.log('Loading internal building overrides from:', internalPath);
const internalRaw = readFileSync(internalPath, 'utf8');
const internals = JSON.parse(internalRaw);

if (!Array.isArray(internals)) {
  console.error('Error: internal ledger must be an array');
  process.exit(1);
}

// Import validator functions from compiled or source module
import {
  validateInternalOverride,
  validatePublicOverride,
  validateReleaseManifest,
  detectPrivateFieldLeakage,
  exportPublicReleaseManifest
} from '../src/features/exploration/map/types/buildingOverride.ts';

// 1. Validate internal entries
let internalErrors = 0;
internals.forEach((item, index) => {
  const result = validateInternalOverride(item);
  if (!result.valid) {
    console.error(`Internal item [${index}] invalid:`, result.errors);
    internalErrors++;
  }
});

if (internalErrors > 0) {
  console.error(`Found ${internalErrors} invalid internal records. Aborting export.`);
  process.exit(1);
}

console.log(`Validated ${internals.length} internal records successfully.`);

// 2. Export public release manifest
const RELEASE_ID = process.env.RELEASE_ID || 'release-2026-11-v3-reviewed';
const SOURCE_VERSION = 'plateau-2023-lod3';
const DESCRIPTION = '深海あつめ 段階3「びゅうお近景改善」配信版';

const releaseManifest = exportPublicReleaseManifest(
  internals,
  RELEASE_ID,
  SOURCE_VERSION,
  DESCRIPTION,
  '2026-11-16'
);

// Map chunk overrides if regenerated chunks exist
const previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
releaseManifest.chunkOverrides = Object.fromEntries(Object.entries(previous.chunkOverrides ?? {}).filter(([, chunk]) =>
  chunk.overrideIds.every(id => releaseManifest.overrides.some(o => o.overrideId === id && o.status === 'published'))
));

// 3. Write public files
const publicOverrides = releaseManifest.overrides;
writeFileSync(publicPath, JSON.stringify(publicOverrides, null, 2) + '\n', 'utf8');
console.log(`Wrote ${publicOverrides.length} public overrides to: ${publicPath}`);

writeFileSync(manifestPath, JSON.stringify(releaseManifest, null, 2) + '\n', 'utf8');
console.log(`Wrote release manifest (${releaseManifest.releaseId}) to: ${manifestPath}`);

// 4. Verify public outputs have zero private leaks
let publicLeaks = 0;
publicOverrides.forEach((pub, index) => {
  const leaks = detectPrivateFieldLeakage(pub);
  if (leaks.length > 0) {
    console.error(`LEAK DETECTED in public record [${index}]:`, leaks);
    publicLeaks++;
  }
  const val = validatePublicOverride(pub);
  if (!val.valid) {
    console.error(`Public record [${index}] invalid:`, val.errors);
    publicLeaks++;
  }
});

const manifestVal = validateReleaseManifest(releaseManifest);
if (!manifestVal.valid) {
  console.error('Release manifest invalid:', manifestVal.errors);
  publicLeaks++;
}

if (publicLeaks > 0) {
  console.error(`Export verification failed with ${publicLeaks} errors!`);
  process.exit(1);
}

console.log('✓ Public export completed with ZERO private leaks and 100% schema compliance.');
