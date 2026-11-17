import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuildingSelectionManager, isPointInPolygon, type ChunkBuildingSelection } from '../features/exploration/map/three/buildingSelection';
import { placeForBuilding } from '../features/scenery/places';

const dataDir = resolve(__dirname, '../../public/map/data');
const BYUUO = 'bldg_7380cb7d-8b33-48d5-b9d1-6324ae3d6526';
const NEIGHBOUR = 'bldg_a74878d3-e3ec-4e66-9ca6-d8f47ca75d88';

async function managerFor(chunk: string) {
  const manager = new BuildingSelectionManager();
  global.fetch = (async () => ({ ok: true, json: async () => JSON.parse(readFileSync(resolve(dataDir, `buildings-${chunk}.json`), 'utf8')) })) as unknown as typeof fetch;
  expect(await manager.loadChunk(chunk, 'http://test/')).toBe(true);
  return manager;
}

describe('wall hits next to a larger building', () => {
  it('names the building next to Byuuo, not Byuuo, when its south wall is pressed', async () => {
    const manager = await managerFor('port');
    const south = new THREE.Vector3(0, 0, 1);
    // The neighbour's south wall lies about 0.8 m inside Byuuo's convex outline.
    for (const [x, z] of [[-295.7, -6.1], [-293.2, -6.75], [-295.7, -5.95], [-295.7, -6.3]]) {
      const found = manager.findBuilding(new THREE.Vector3(x, 51, z), south);
      expect(found?.id).toBe(NEIGHBOUR);
      expect(placeForBuilding(found!.id)).toBeUndefined();
    }
    manager.dispose();
  });

  it('still names Byuuo on its own outline and roof', async () => {
    const manager = await managerFor('port');
    const byuuo = manager.getBuildingById(BYUUO)!;
    expect(manager.findBuilding(new THREE.Vector3(byuuo.center[0], byuuo.topY, byuuo.center[2]), new THREE.Vector3(0, 1, 0))?.id).toBe(BYUUO);
    // East side of the outline, pressed from the east.
    expect(manager.findBuilding(new THREE.Vector3(-264.25, 70, 18.6), new THREE.Vector3(0.97, 0, -0.26))?.id).toBe(BYUUO);
    // A wall well inside the outline (the gate between the towers) has no outline owner and keeps the containment rule.
    expect(manager.findBuilding(new THREE.Vector3(-280, 60, 20), new THREE.Vector3(1, 0, 0))?.id).toBe(BYUUO);
    manager.dispose();
  });

  it('resolves outline walls to their own building across every chunk more often than containment alone', () => {
    let walls = 0, wrongWithNormal = 0, wrongWithout = 0;
    for (const file of readdirSync(dataDir).filter(name => /^buildings-.*\.json$/.test(name))) {
      const data = JSON.parse(readFileSync(resolve(dataDir, file), 'utf8')) as ChunkBuildingSelection;
      const manager = new BuildingSelectionManager();
      (manager as unknown as { chunks: Map<string, ChunkBuildingSelection> }).chunks.set(data.chunk, data);
      for (const b of data.buildings) {
        const n = b.footprint.length;
        for (let i = 0; i < n; i++) {
          const [x1, z1] = b.footprint[i], [x2, z2] = b.footprint[(i + 1) % n];
          const length = Math.hypot(x2 - x1, z2 - z1);
          if (length < 1) continue;
          const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
          let nx = (z2 - z1) / length, nz = -(x2 - x1) / length;
          if (isPointInPolygon(mx + nx * .3, mz + nz * .3, b.footprint)) { nx = -nx; nz = -nz; }
          const point = new THREE.Vector3(mx, (b.baseY + b.topY) / 2, mz);
          walls++;
          if (manager.findBuilding(point, new THREE.Vector3(nx, 0, nz))?.id !== b.id) wrongWithNormal++;
          if (manager.findBuilding(point)?.id !== b.id) wrongWithout++;
        }
      }
      manager.dispose();
    }
    console.log(`outline walls ${walls}: other building or none without normal ${wrongWithout}, with normal ${wrongWithNormal}`);
    expect(walls).toBeGreaterThan(100000);
    expect(wrongWithNormal).toBeLessThan(wrongWithout / 4);
  }, 120000);
});
