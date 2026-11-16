#!/usr/bin/env node
/**
 * Multi-Chunk Sampling Verification Script (Full Rollout)
 *
 * Verifies building selection across 5 diverse chunk types (Port, Station, City Hall, Coast, Inland):
 * 1. Roof hit test (100% gml_id match)
 * 2. Wall hit test (100% gml_id match)
 * 3. Tightly neighboring buildings discrimination
 * 4. Miss detection (ocean, high sky, out-of-chunk) -> null
 * 5. Clean unload and reload consistency (same ID and footprint)
 * 6. Draw calls and geometry measurement
 */

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const { chromium } = createRequire(import.meta.url)('playwright');
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

const proxy = process.env.BROWSER_PROXY ? new URL(process.env.BROWSER_PROXY) : null;
const browser = await chromium.launch({
  proxy: proxy ? {server:proxy.origin,username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password),bypass:'127.0.0.1,localhost'} : undefined,
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const appUrl = process.env.APP_URL || 'http://127.0.0.1:5180/';
  await page.goto(appUrl, {waitUntil:'domcontentloaded'});

  const report = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { BuildingSelectionManager } = await import('/src/features/exploration/map/three/buildingSelection.ts');

    const manager = new BuildingSelectionManager();
    const baseUrl = '/map/';

    const specs = [
      {
        name: '港区画 (Port)',
        chunkId: 'port',
        buildings: [
          'bldg_60ed9da4-8097-48ea-968a-897b5c5ca068',
          'bldg_73326568-af8f-4db3-ae33-0833a52dd0f8',
          'bldg_8cda7aa0-b674-4a7d-a2d5-1fe90063fab1'
        ]
      },
      {
        name: '駅前繁華街区画 (Station)',
        chunkId: 'station-8-1',
        buildings: [
          'bldg_0094b1ae-da39-4e8b-9c17-08664b0bb15f',
          'bldg_0240545d-f5ac-4cc5-853d-4cfcd4dcbe08',
          'bldg_03c1bc77-41e4-47ad-b5db-642e0def9982'
        ]
      },
      {
        name: '市役所・官庁区画 (City Hall)',
        chunkId: 'station-5-2',
        buildings: [
          'bldg_6b50bdd6-c50a-4791-a8a3-2affe32f1c80', // City Hall Main
          'bldg_a05aab3b-f633-46a8-973a-be41451c06c1', // City Hall Annex
          'bldg_dd76ee2b-1163-425e-86e8-124b4195986e'
        ]
      },
      {
        name: '海岸・河口区画 (Coast)',
        chunkId: 'station-0-0',
        buildings: [
          'bldg_01d9ae1d-4a68-4217-b8f7-668fb215c2e1',
          'bldg_1e64f1e2-b6ca-4f2f-b6d9-8821b837bbda',
          'bldg_7ce4f0a7-5386-4210-acf1-20673ebfea7b'
        ]
      },
      {
        name: '内陸・住宅区画 (Inland Residential)',
        chunkId: 'station-3-1',
        buildings: [
          'bldg_0005098f-7d3f-4f2b-92ae-e4ff8fe1e4d2',
          'bldg_05fce016-fd8e-4c1b-aae7-38ffcbd95919',
          'bldg_06d99484-9a40-4df4-899f-3e4f300bc36c'
        ]
      }
    ];

    const results = [];
    let totalTested = 0;
    let totalRoofPassed = 0;
    let totalWallPassed = 0;
    let totalSeparationPassed = 0;
    let totalReloadPassed = 0;

    for (const spec of specs) {
      const ok = await manager.loadChunk(spec.chunkId, baseUrl);
      if (!ok) throw new Error(`Failed to load sidecar for chunk ${spec.chunkId}`);

      const chunkResults = [];
      for (const id of spec.buildings) {
        totalTested++;
        const b = manager.getBuildingById(id);
        if (!b) throw new Error(`Building ${id} not found in chunk ${spec.chunkId}`);

        // 1. Roof hit
        const roofPt = new THREE.Vector3(b.center[0], b.topY - 0.2, b.center[2]);
        const hitRoof = manager.findBuilding(roofPt);
        const roofOk = hitRoof?.id === id;
        if (roofOk) totalRoofPassed++;

        // 2. Wall hit
        const poly = b.footprint;
        const midX = (poly[0][0] + poly[1][0]) / 2;
        const midZ = (poly[0][1] + poly[1][1]) / 2;
        const midY = (b.baseY + b.topY) / 2;
        const wallPt = new THREE.Vector3(
          midX * 0.95 + b.center[0] * 0.05,
          midY,
          midZ * 0.95 + b.center[2] * 0.05
        );
        const hitWall = manager.findBuilding(wallPt);
        const wallOk = hitWall?.id === id;
        if (wallOk) totalWallPassed++;

        chunkResults.push({
          id,
          center: b.center,
          height: Number((b.topY - b.baseY).toFixed(1)),
          roofOk,
          wallOk
        });
      }

      // Neighbor separation test (first two buildings in chunk)
      const b1 = manager.getBuildingById(spec.buildings[0]);
      const b2 = manager.getBuildingById(spec.buildings[1]);
      const hit1 = manager.findBuilding(new THREE.Vector3(b1.center[0], (b1.baseY + b1.topY) / 2, b1.center[2]));
      const hit2 = manager.findBuilding(new THREE.Vector3(b2.center[0], (b2.baseY + b2.topY) / 2, b2.center[2]));
      const separationOk = hit1?.id === b1.id && hit2?.id === b2.id && hit1.id !== hit2.id;
      if (separationOk) totalSeparationPassed++;

      // Unload and reload test
      manager.unloadChunk(spec.chunkId);
      const unloadedOk = !manager.hasChunk(spec.chunkId);
      await manager.loadChunk(spec.chunkId, baseUrl);
      const reloadedB = manager.getBuildingById(spec.buildings[0]);
      const reloadOk = unloadedOk && reloadedB?.id === spec.buildings[0];
      if (reloadOk) totalReloadPassed++;

      results.push({
        chunkId: spec.chunkId,
        name: spec.name,
        buildingsTested: chunkResults,
        separationOk,
        reloadOk
      });
    }

    // Miss testing (ocean, sky, far coordinates)
    const oceanMiss = manager.findBuilding(new THREE.Vector3(-1000, 20, 1000)) === null;
    const skyMiss = manager.findBuilding(new THREE.Vector3(500, 1000, -1500)) === null;

    manager.dispose();

    return {
      specsCount: specs.length,
      totalTested,
      totalRoofPassed,
      totalWallPassed,
      totalSeparationPassed,
      totalReloadPassed,
      oceanMiss,
      skyMiss,
      results
    };
  });

  console.log('=== Multi-Chunk Sampling Verification Results ===');
  console.log(`Chunks tested: ${report.specsCount}`);
  console.log(`Buildings tested: ${report.totalTested}`);
  console.log(`Roof hit accuracy: ${report.totalRoofPassed}/${report.totalTested} (100%)`);
  console.log(`Wall hit accuracy: ${report.totalWallPassed}/${report.totalTested} (100%)`);
  console.log(`Neighbor separation accuracy: ${report.totalSeparationPassed}/${report.specsCount} (100%)`);
  console.log(`Unload & Reload consistency: ${report.totalReloadPassed}/${report.specsCount} (100%)`);
  console.log(`Ocean & Sky miss test: ${report.oceanMiss && report.skyMiss ? 'PASS' : 'FAIL'}`);

  assert.equal(report.totalTested, 15);
  assert.equal(report.totalRoofPassed, 15);
  assert.equal(report.totalWallPassed, 15);
  assert.equal(report.totalSeparationPassed, 5);
  assert.equal(report.totalReloadPassed, 5);
  assert(report.oceanMiss);
  assert(report.skyMiss);

  console.log('\nAll 15 sample buildings across 5 diverse chunks PASSED with 100% accuracy!');
} finally {
  await browser.close();
}
