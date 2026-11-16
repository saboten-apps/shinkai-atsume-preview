import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BuildingSelectionManager,
  isPointInPolygon,
  distanceToPolygon,
  ChunkBuildingSelection
} from '../features/exploration/map/three/buildingSelection';

const dataDir = resolve(__dirname, '../../public/map/data');

describe('BuildingSelectionManager & Spatial Index (Full Rollout)', () => {
  let manager: BuildingSelectionManager;

  beforeEach(() => {
    manager = new BuildingSelectionManager();

    // Mock global fetch for arbitrary chunk sidecar loading
    global.fetch = async (url: RequestInfo | URL) => {
      const u = String(url);
      const match = u.match(/buildings-([^/]+)\.json$/);
      if (match) {
        const chunkId = match[1];
        const filePath = resolve(dataDir, `buildings-${chunkId}.json`);
        if (existsSync(filePath)) {
          const data = JSON.parse(readFileSync(filePath, 'utf8'));
          return {
            ok: true,
            json: async () => data,
          } as Response;
        }
      }
      return { ok: false, status: 404 } as Response;
    };
  });

  afterEach(() => {
    manager.dispose();
  });

  it('correctly calculates point-in-polygon and distance to polygon', () => {
    const square: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];

    expect(isPointInPolygon(5, 5, square)).toBe(true);
    expect(isPointInPolygon(0.1, 0.1, square)).toBe(true);
    expect(isPointInPolygon(15, 5, square)).toBe(false);
    expect(isPointInPolygon(-5, 5, square)).toBe(false);

    expect(distanceToPolygon(15, 5, square)).toBeCloseTo(5.0);
    expect(distanceToPolygon(5, -3, square)).toBeCloseTo(3.0);
  });

  it('loads chunk selection data and unloads cleanly without leaking memory', async () => {
    expect(manager.loadedChunkCount).toBe(0);
    expect(manager.totalBuildingCount).toBe(0);

    const loaded = await manager.loadChunk('station-5-2', 'http://test/');
    expect(loaded).toBe(true);
    expect(manager.hasChunk('station-5-2')).toBe(true);
    expect(manager.loadedChunkCount).toBe(1);
    expect(manager.totalBuildingCount).toBe(393);

    // Idempotent loading
    await manager.loadChunk('station-5-2', 'http://test/');
    expect(manager.loadedChunkCount).toBe(1);

    // Unload
    manager.unloadChunk('station-5-2');
    expect(manager.hasChunk('station-5-2')).toBe(false);
    expect(manager.loadedChunkCount).toBe(0);
    expect(manager.totalBuildingCount).toBe(0);

    // Re-load reproduces exact same state
    const reloaded = await manager.loadChunk('station-5-2', 'http://test/');
    expect(reloaded).toBe(true);
    expect(manager.totalBuildingCount).toBe(393);
  });

  it('verifies all 56 chunk sidecars exist and total buildings strictly match 20,522', async () => {
    const manifestPath = resolve(dataDir, 'station-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    let totalFromSidecars = 0;
    for (const chunk of manifest.chunks) {
      const sidecarPath = resolve(dataDir, `buildings-${chunk.id}.json`);
      expect(existsSync(sidecarPath)).toBe(true);
      const sidecar: ChunkBuildingSelection = JSON.parse(readFileSync(sidecarPath, 'utf8'));
      expect(sidecar.chunk).toBe(chunk.id);
      expect(sidecar.count).toBe(chunk.buildings);
      expect(sidecar.buildings.length).toBe(chunk.buildings);
      totalFromSidecars += sidecar.count;
    }

    expect(totalFromSidecars).toBe(20522);
    expect(manifest.chunks.length).toBe(56);
  });

  it('conducts multi-chunk sampling verification across 5 diverse areas (15 buildings)', async () => {
    // 5 diverse chunks: Port, Station front, City hall, Coast, Residential inland
    const sampleSpecs = [
      {
        chunkId: 'port',
        buildings: [
          'bldg_60ed9da4-8097-48ea-968a-897b5c5ca068',
          'bldg_73326568-af8f-4db3-ae33-0833a52dd0f8',
          'bldg_8cda7aa0-b674-4a7d-a2d5-1fe90063fab1'
        ]
      },
      {
        chunkId: 'station-8-1',
        buildings: [
          'bldg_0094b1ae-da39-4e8b-9c17-08664b0bb15f',
          'bldg_0240545d-f5ac-4cc5-853d-4cfcd4dcbe08',
          'bldg_03c1bc77-41e4-47ad-b5db-642e0def9982'
        ]
      },
      {
        chunkId: 'station-5-2',
        buildings: [
          'bldg_6b50bdd6-c50a-4791-a8a3-2affe32f1c80', // City Hall Main
          'bldg_a05aab3b-f633-46a8-973a-be41451c06c1', // City Hall Annex
          'bldg_dd76ee2b-1163-425e-86e8-124b4195986e'
        ]
      },
      {
        chunkId: 'station-0-0',
        buildings: [
          'bldg_01d9ae1d-4a68-4217-b8f7-668fb215c2e1',
          'bldg_1e64f1e2-b6ca-4f2f-b6d9-8821b837bbda',
          'bldg_7ce4f0a7-5386-4210-acf1-20673ebfea7b'
        ]
      },
      {
        chunkId: 'station-3-1',
        buildings: [
          'bldg_0005098f-7d3f-4f2b-92ae-e4ff8fe1e4d2',
          'bldg_05fce016-fd8e-4c1b-aae7-38ffcbd95919',
          'bldg_06d99484-9a40-4df4-899f-3e4f300bc36c'
        ]
      }
    ];

    for (const spec of sampleSpecs) {
      await manager.loadChunk(spec.chunkId, 'http://test/');

      for (const expectedId of spec.buildings) {
        const b = manager.getBuildingById(expectedId);
        expect(b).toBeDefined();
        if (!b) continue;

        // 1. Roof Hit Test
        const roofHit = new THREE.Vector3(b.center[0], b.topY - 0.2, b.center[2]);
        const roofResult = manager.findBuilding(roofHit);
        expect(roofResult).toBeDefined();
        expect(roofResult?.id).toBe(expectedId);
        expect(roofResult?.year).toBe(2023);
        expect(roofResult?.lat).toBeCloseTo(b.lat, 4);
        expect(roofResult?.lon).toBeCloseTo(b.lon, 4);

        // 2. Wall Hit Test (Perimeter midpoint)
        const poly = b.footprint;
        expect(poly.length).toBeGreaterThanOrEqual(3);
        const p1 = poly[0], p2 = poly[1];
        const midX = (p1[0] + p2[0]) / 2;
        const midZ = (p1[1] + p2[1]) / 2;
        const midY = (b.baseY + b.topY) / 2;
        // Point slightly inside footprint boundary
        const wallHit = new THREE.Vector3(
          midX * 0.95 + b.center[0] * 0.05,
          midY,
          midZ * 0.95 + b.center[2] * 0.05
        );
        const wallResult = manager.findBuilding(wallHit);
        expect(wallResult).toBeDefined();
        expect(wallResult?.id).toBe(expectedId);
      }

      // 3. Unload and Reload consistency
      manager.unloadChunk(spec.chunkId);
      expect(manager.hasChunk(spec.chunkId)).toBe(false);
      const reloaded = await manager.loadChunk(spec.chunkId, 'http://test/');
      expect(reloaded).toBe(true);

      const firstBuilding = manager.getBuildingById(spec.buildings[0]);
      expect(firstBuilding?.id).toBe(spec.buildings[0]);
    }
  });

  it('correctly discriminates tightly neighboring buildings across sample chunks', async () => {
    // Port neighbor pair: bldg_73326568... and bldg_8cda7aa0...
    await manager.loadChunk('port', 'http://test/');
    const p1 = manager.getBuildingById('bldg_73326568-af8f-4db3-ae33-0833a52dd0f8')!;
    const p2 = manager.getBuildingById('bldg_8cda7aa0-b674-4a7d-a2d5-1fe90063fab1')!;
    expect(p1).toBeDefined();
    expect(p2).toBeDefined();

    const hitP1 = manager.findBuilding(new THREE.Vector3(p1.center[0], p1.baseY + 1, p1.center[2]));
    const hitP2 = manager.findBuilding(new THREE.Vector3(p2.center[0], p2.baseY + 1, p2.center[2]));
    expect(hitP1?.id).toBe(p1.id);
    expect(hitP2?.id).toBe(p2.id);
    expect(hitP1?.id).not.toBe(hitP2?.id);
  });

  it('returns null on misses, ocean points, and points outside chunk', async () => {
    await manager.loadChunk('station-5-2', 'http://test/');

    // Far away in the sea
    expect(manager.findBuilding(new THREE.Vector3(-1000, 30, 1000))).toBeNull();

    // In the air high above buildings (y = 500)
    expect(manager.findBuilding(new THREE.Vector3(500, 500, -1500))).toBeNull();

    // Deep underground (y = -100)
    expect(manager.findBuilding(new THREE.Vector3(500, -100, -1500))).toBeNull();

    // In a distant chunk (Numazu port area: x = -20, z = -190) when port is not loaded
    expect(manager.findBuilding(new THREE.Vector3(-20, 42, -190))).toBeNull();
  });

  it('creates and cleans up highlight 3D object for selected building', async () => {
    await manager.loadChunk('station-5-2', 'http://test/');
    const b = manager.getBuildingById('bldg_6b50bdd6-c50a-4791-a8a3-2affe32f1c80')!;

    const highlight = manager.createHighlight(b);
    expect(highlight).toBeDefined();
    expect(highlight?.name).toBe('building-selection-highlight');
    expect(highlight?.children.length).toBeGreaterThanOrEqual(1);

    // Highlight null on empty record
    expect(manager.createHighlight(null)).toBeNull();
  });
});
