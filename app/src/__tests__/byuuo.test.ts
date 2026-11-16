import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { BYUUO, byuuoPoint, createByuuo } from '../features/exploration/map/three/byuuo';
import { BuildingOverrideManager, BASE_RELEASE_ID } from '../features/exploration/map/three/buildingOverride';
import { Octree } from 'three/examples/jsm/math/Octree.js';

describe('Stage 3: Byuuo Landmark Improvement', () => {
  it('1. verifies Byuuo coordinates and rotation angle alignment with GSI watergate', () => {
    expect(BYUUO.chunk).toBe('port');
    expect(BYUUO.originalGmlId).toBe('bldg_7380cb7d-8b33-48d5-b9d1-6324ae3d6526');
    expect(BYUUO.x).toBeCloseTo(-276.05, 1);
    expect(BYUUO.z).toBeCloseTo(22.335, 1);
    expect(BYUUO.rotation).toBeCloseTo(-1.3054, 3);

    // Verify west and east tower calculated endpoints
    const westPt = byuuoPoint(-28.9, 0, 0);
    const eastPt = byuuoPoint(28.9, 0, 0);
    expect(westPt.x).toBeCloseTo(-283.63, 0.5);
    expect(westPt.z).toBeCloseTo(-5.55, 0.5);
    expect(eastPt.x).toBeCloseTo(-268.47, 0.5);
    expect(eastPt.z).toBeCloseTo(50.22, 0.5);
  });

  it('2. generates procedural Byuuo model with coarse, detail, and photo groups', () => {
    const byuuo = createByuuo();
    expect(byuuo.root).toBeDefined();
    expect(byuuo.collider).toBeDefined();

    const coarseGroup = byuuo.root.getObjectByName('byuuo-coarse-mesh');
    const detailGroup = byuuo.root.getObjectByName('byuuo-near-details');
    const photosGroup = byuuo.root.getObjectByName('byuuo-photographs');

    expect(coarseGroup).toBeDefined();
    expect(detailGroup).toBeDefined();
    expect(photosGroup).toBeDefined();

    // Verify polygon counts
    let triCount = 0;
    byuuo.root.traverse(o => {
      if (o instanceof THREE.Mesh && o.geometry) {
        const count = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.getAttribute('position').count / 3;
        triCount += count;
      }
    });

    expect(triCount).toBeGreaterThan(500);
    expect(triCount).toBeLessThan(25000); // 3MB / lightweight budget

    byuuo.dispose();
  });

  it('3. confirms water channel clearance under gate is passable, and solid collisions on towers/gate', () => {
    const byuuo = createByuuo();
    const octree = new Octree().fromGraphNode(byuuo.collider);

    // Water channel passage test (local x=0, y=3m, through channel from z=-25 to +25)
    // Clearance under gate is ~26m, so y=3m must have 0 obstacles
    const channelStart = byuuoPoint(0, 3.0, -25);
    const channelEnd = byuuoPoint(0, 3.0, 25);
    const channelDir = channelEnd.clone().sub(channelStart).normalize();
    const hitChannel = octree.rayIntersect(new THREE.Ray(channelStart, channelDir));
    expect(hitChannel).toBeFalsy(); // Pass-through completely unobstructed!

    // East tower collision test (local x=24.5, y=10m, hitting tower shaft)
    const towerStart = byuuoPoint(24.5, 10.0, -20);
    const towerEnd = byuuoPoint(24.5, 10.0, 20);
    const towerDir = towerEnd.clone().sub(towerStart).normalize();
    const hitTower = octree.rayIntersect(new THREE.Ray(towerStart, towerDir));
    expect(hitTower).toBeTruthy();
    expect(hitTower!.distance).toBeCloseTo(15.25, 0.5);

    // Gate plate body collision test (local x=0, y=31m, hitting gate body)
    const gateStart = byuuoPoint(0, 31.0, -20);
    const gateEnd = byuuoPoint(0, 31.0, 20);
    const gateDir = gateEnd.clone().sub(gateStart).normalize();
    const hitGate = octree.rayIntersect(new THREE.Ray(gateStart, gateDir));
    expect(hitGate).toBeTruthy();
    expect(hitGate!.distance).toBeCloseTo(18.75, 0.5);

    byuuo.dispose();
  });

  it('4. checks BuildingOverrideManager integration with release-2026-11-v3', () => {
    const mgr = new BuildingOverrideManager('release-2026-11-v3');
    expect(mgr.getActiveReleaseId()).toBe('release-2026-11-v3');

    // Test chunk url mapping
    const manifest = {
      releaseId: 'release-2026-11-v3',
      sourceVersion: 'plateau-2023-lod3',
      updatedAt: '2026-11-16',
      description: '深海あつめ 段階3「びゅうお近景改善」配信版',
      overrides: [
        {
          overrideId: 'ovr_port_bldg_7380cb7d',
          buildingKey: 'bldg_7380cb7d-8b33-48d5-b9d1-6324ae3d6526',
          chunkId: 'port',
          sourceVersion: 'plateau-2023-lod3',
          operation: 'replace' as const,
          reason: 'Byuuo replacement',
          verifiedAt: '2026-11-16',
          revision: 1,
          status: 'published' as const
        }
      ],
      chunkOverrides: {
        'port': {
          chunkId: 'port',
          regeneratedUrl: 'data/2023-lod3-port-ovr1-packed.glb',
          overrideIds: ['ovr_port_bldg_7380cb7d']
        }
      }
    };

    const valid = mgr.setManifest(manifest);
    expect(valid).toBe(true);
    expect(mgr.getChunkUrl('port', 'data/2023-lod3-port-packed.glb')).toBe('data/2023-lod3-port-ovr1-packed.glb');

    // Rollback test: switching to v1 returns original URL
    mgr.setReleaseId(BASE_RELEASE_ID);
    expect(mgr.getChunkUrl('port', 'data/2023-lod3-port-packed.glb')).toBe('data/2023-lod3-port-packed.glb');
  });
});
