import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

console.log('=== Starting Byuuo Stage 3 Verification Suite ===\n');

const proxy = process.env.BROWSER_PROXY ? new URL(process.env.BROWSER_PROXY) : null;
const browser = await chromium.launch({
  proxy: proxy ? {server:proxy.origin,username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password),bypass:'127.0.0.1,localhost'} : undefined,
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const errors = [];
  const sidecarRequests = [];
  await page.route('**/buildings-*.json', route => { sidecarRequests.push(route.request().url()); return route.abort(); });
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('ERR_TUNNEL_CONNECTION_FAILED')) {
      errors.push(msg.text());
    }
  });

  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5189/', {waitUntil:'domcontentloaded'});

  const report = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { buildNumazuPortScene } = await import('/src/features/exploration/map/three/sceneBuilder.ts');
    const { BYUUO, byuuoPoint, createByuuo } = await import('/src/features/exploration/map/three/byuuo.ts');
    const { Octree } = await import('/node_modules/three/examples/jsm/math/Octree.js');

    // 1. Model Statistics Verification
    const standaloneByuuo = createByuuo();
    let coarseTriangles = 0;
    let detailTriangles = 0;
    const materials = new Set();
    standaloneByuuo.root.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry) {
        const count = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.getAttribute('position').count / 3;
        if (o.name.includes('near')) detailTriangles += count;
        else coarseTriangles += count;
        if (Array.isArray(o.material)) o.material.forEach(m => materials.add(m));
        else if (o.material) materials.add(o.material);
      }
    });

    // 2. Collision & Pass-through Tests
    const octree = new Octree().fromGraphNode(standaloneByuuo.collider);

    // Test A: Waterway channel passage (under gate: local x=0, y=3m, z: -20 -> +20)
    // Water level is y=41.5, water channel height y=44.0 (3.5m above water, under 26m gate clearance)
    const channelStart = byuuoPoint(0, 3.0, -25);
    const channelEnd = byuuoPoint(0, 3.0, 25);
    const channelDir = channelEnd.clone().sub(channelStart).normalize();
    const rayChannel = new THREE.Ray(channelStart, channelDir);
    const hitChannel = octree.rayIntersect(rayChannel);
    const channelPassable = !hitChannel || hitChannel.distance > 45; // Must pass completely through

    // Test B: Tower collision (hitting East tower: local x=24.5, y=10, z: -20 -> +20)
    const towerStart = byuuoPoint(24.5, 10.0, -20);
    const towerEnd = byuuoPoint(24.5, 10.0, 20);
    const towerDir = towerEnd.clone().sub(towerStart).normalize();
    const rayTower = new THREE.Ray(towerStart, towerDir);
    const hitTower = octree.rayIntersect(rayTower);

    // Test C: Gate body collision (hitting gate plate at y=31m: local x=0, y=31m, z: -20 -> +20)
    const gateStart = byuuoPoint(0, 31.0, -20);
    const gateEnd = byuuoPoint(0, 31.0, 20);
    const gateDir = gateEnd.clone().sub(gateStart).normalize();
    const rayGate = new THREE.Ray(gateStart, gateDir);
    const hitGate = octree.rayIntersect(rayGate);

    standaloneByuuo.dispose();

    // 3. Scene Integration & LOD / Unload Test
    const scene = new THREE.Scene();
    scene.userData.releaseId = 'release-2026-11-v3-reviewed';
    const colliders = [];
    const model = buildNumazuPortScene(scene, undefined, g => colliders.push(g));
    await model.ready;

    const byuuoCenter = new THREE.Vector3(BYUUO.x, BYUUO.y + 20, BYUUO.z);

    // Stream port chunk near byuuo
    for (let i = 0; i < 40; i++) {
      model.updateBuildings(byuuoCenter, byuuoCenter);
      await new Promise(r => setTimeout(r, 60));
    }
    await model.groundReady();
    model.updateBuildings(byuuoCenter, byuuoCenter);
    scene.updateMatrixWorld(true);

    const attachedByuuo = scene.getObjectByName('numazu-byuuo');
    const nearDetails = scene.getObjectByName('byuuo-near-details');
    const photoGroup = scene.getObjectByName('byuuo-photographs');

    // Test Near LOD: viewer at 50m
    const nearViewer = byuuoCenter.clone().add(new THREE.Vector3(30, 0, 30));
    model.updateBuildings(byuuoCenter, nearViewer);
    const nearDetailVisible = nearDetails ? nearDetails.visible : false;

    // Wait for photo loading
    await new Promise(r => setTimeout(r, 500));
    const photoTexturesLoaded = attachedByuuo ? attachedByuuo.userData.photoTextures : 0;
    const photoStateNear = attachedByuuo ? attachedByuuo.userData.photoState : 'none';

    // Test Far LOD: viewer at 320m (beyond 290m hysteresis)
    const farViewer = byuuoCenter.clone().add(new THREE.Vector3(250, 0, 250));
    model.updateBuildings(byuuoCenter, farViewer);
    const farDetailVisible = nearDetails ? nearDetails.visible : false;
    const photoGroupVisibleFar = photoGroup ? photoGroup.visible : false;

    // Test Clean Unload: viewer at 800m (beyond 650m unload radius)
    const distantPos = new THREE.Vector3(1500, 50, -1500);
    for (let i = 0; i < 20; i++) {
      model.updateBuildings(distantPos, distantPos);
      await new Promise(r => setTimeout(r, 50));
    }
    const byuuoAfterUnload = scene.getObjectByName('numazu-byuuo');

    return {
      modelStats: {
        coarseTriangles,
        detailTriangles,
        totalTriangles: coarseTriangles + detailTriangles,
        uniqueMaterials: materials.size
      },
      collisionTests: {
        channelPassable,
        hitChannelDist: hitChannel ? hitChannel.distance : null,
        hitTower: !!hitTower,
        hitTowerDist: hitTower ? hitTower.distance : null,
        hitGate: !!hitGate,
        hitGateDist: hitGate ? hitGate.distance : null
      },
      lodAndIntegration: {
        byuuoAttached: !!attachedByuuo,
        nearDetailVisible,
        photoTexturesLoaded,
        photoStateNear,
        farDetailVisible,
        photoGroupVisibleFar,
        unloadedBeyond650m: !byuuoAfterUnload
      }
    };
  });

  console.log('Verification Report:\n', JSON.stringify(report, null, 2));

  // Assertions
  assert.deepEqual(sidecarRequests, [], 'Normal exploration must not fetch admin sidecars');
  assert.equal(report.lodAndIntegration.photoTexturesLoaded, 5);
  assert.ok(report.modelStats.totalTriangles > 500, 'Model must have sufficient detail');
  assert.ok(report.modelStats.totalTriangles < 25000, 'Model must be within 25,000 triangle budget');
  assert.ok(report.collisionTests.channelPassable, 'Waterway channel must be completely passable under the gate');
  assert.ok(report.collisionTests.hitTower, 'Tower must have solid collision');
  assert.ok(report.collisionTests.hitGate, 'Gate body must have collision');
  assert.ok(report.lodAndIntegration.byuuoAttached, 'Byuuo model must be attached in release v3');
  assert.ok(report.lodAndIntegration.nearDetailVisible, 'Near details must be visible within 250m');
  assert.ok(!report.lodAndIntegration.farDetailVisible, 'Near details must be hidden beyond 290m');
  assert.ok(report.lodAndIntegration.unloadedBeyond650m, 'Byuuo model must be cleaned up when chunk unloads');

  console.log('\n✓ ALL BYUOO STAGE 3 VERIFICATION CHECKS PASSED (100%)');

} finally {
  await browser.close();
}
