#!/usr/bin/env node
/**
 * Validate Building Overrides Standalone Script
 *
 * Can be run in CI/scripts to validate:
 * 1. Internal ledger validity
 * 2. Public ledger validity
 * 3. Release manifest validity
 * 4. Zero private field leakage
 * 5. Invalid records rejection test
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDir = resolve(__dirname, '../public/map/data');

import {
  validateInternalOverride,
  validatePublicOverride,
  validateReleaseManifest,
  detectPrivateFieldLeakage
} from '../src/features/exploration/map/types/buildingOverride.ts';

console.log('=== Building Overrides Schema Validation ===');

// 1. Validate Internal Ledger
const internalPath = resolve(__dirname, '../data/building-overrides-internal.json');
const internals = JSON.parse(readFileSync(existsSync(internalPath) ? internalPath : resolve(__dirname, '../data/building-overrides.example.json'), 'utf8'));
console.log(`Checking internal ledger (${internals.length} items)...`);

for (const [idx, item] of internals.entries()) {
  const res = validateInternalOverride(item);
  if (!res.valid) {
    console.error(`FAIL: Internal item [${idx}] invalid:`, res.errors);
    process.exit(1);
  }
}
console.log('✓ Internal ledger schema valid.');

// 2. Validate Public Ledger
const publicPath = resolve(baseDir, 'building-overrides.json');
const publics = JSON.parse(readFileSync(publicPath, 'utf8'));
console.log(`Checking public ledger (${publics.length} items)...`);

for (const [idx, item] of publics.entries()) {
  const leaks = detectPrivateFieldLeakage(item);
  if (leaks.length > 0) {
    console.error(`FAIL: Private field leak in public item [${idx}]:`, leaks);
    process.exit(1);
  }
  const res = validatePublicOverride(item);
  if (!res.valid) {
    console.error(`FAIL: Public item [${idx}] invalid:`, res.errors);
    process.exit(1);
  }
}
console.log('✓ Public ledger schema valid (zero private field leakage).');

// 3. Validate Release Manifest
const manifestPath = resolve(baseDir, 'release-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
console.log(`Checking release manifest (${manifest.releaseId})...`);

const manifestRes = validateReleaseManifest(manifest);
if (!manifestRes.valid) {
  console.error('FAIL: Release manifest invalid:', manifestRes.errors);
  process.exit(1);
}
console.log('✓ Release manifest valid.');

// 4. Test Invalid Ledger Detection (Negative testing)
console.log('Testing detection of invalid records (negative test)...');

const badRecords = [
  { desc: 'Missing buildingKey', data: { overrideId: 'ovr1', chunkId: 'c1', sourceVersion: 's1', operation: 'hide', reason: 'r', verifiedAt: '2026-11-15', revision: 1, status: 'published' } },
  { desc: 'Invalid operation', data: { overrideId: 'ovr1', buildingKey: 'b1', chunkId: 'c1', sourceVersion: 's1', operation: 'destroy_all', reason: 'r', verifiedAt: '2026-11-15', revision: 1, status: 'published' } },
  { desc: 'Invalid date', data: { overrideId: 'ovr1', buildingKey: 'b1', chunkId: 'c1', sourceVersion: 's1', operation: 'hide', reason: 'r', verifiedAt: '2026/99/99', revision: 1, status: 'published' } },
  { desc: 'Leaked contactInfo in public', data: { overrideId: 'ovr1', buildingKey: 'b1', chunkId: 'c1', sourceVersion: 's1', operation: 'hide', reason: 'r', verifiedAt: '2026-11-15', revision: 1, status: 'published', contactInfo: { name: 'secret' } } }
];

for (const bad of badRecords) {
  const res = validatePublicOverride(bad.data);
  if (res.valid) {
    console.error(`FAIL: Validator failed to reject invalid record: ${bad.desc}`);
    process.exit(1);
  }
}
console.log('✓ Negative tests passed: all invalid records correctly rejected.');

console.log('=== All Building Overrides Validation Checks Passed! ===');
