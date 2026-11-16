import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  validateInternalOverride,
  validatePublicOverride,
  validateReleaseManifest,
  detectPrivateFieldLeakage,
  exportPublicReleaseManifest,
  type BuildingOverrideInternal
} from '../features/exploration/map/types/buildingOverride';
import {
  BuildingOverrideManager,
  removeBuildingGeometry,
  createReplacementBuildingModel,
  BASE_RELEASE_ID,
  EXPECTED_SOURCE_VERSION
} from '../features/exploration/map/three/buildingOverride';
import type { BuildingRecord } from '../features/exploration/map/three/buildingSelection';

describe('Stage 2: BuildingOverride Ledger & Replacement', () => {

  describe('1. 修正台帳の公開用/内部用分離とSchema検証', () => {
    const validInternal: BuildingOverrideInternal = {
      overrideId: 'ovr_station-5-2_bldg_bcf81438',
      buildingKey: 'bldg_bcf81438-5aa2-4b93-bf9d-b81fec1adb28',
      chunkId: 'station-5-2',
      sourceVersion: 'plateau-2023-lod3',
      operation: 'hide',
      assetRef: null,
      reason: '現地確認による解体・更地化に伴う建物の除去',
      verifiedAt: '2026-11-15',
      revision: 1,
      status: 'published',
      contactInfo: {
        name: 'うみまちラボ調査班',
        email: 'audit@example.local',
        phone: '055-900-0000',
        organization: 'うみまちラボ'
      },
      consentText: '現地調査番号20261115-01。公開台帳配信同意済み。',
      rawPhotoGps: {
        lat: 35.095033,
        lon: 138.863917,
        altitude: 43.88,
        accuracyMeters: 2.1
      },
      internalNotes: '市役所別館との離隔7.79m。単独フットプリント分離確認済み。'
    };

    it('validates a complete internal override entry', () => {
      const res = validateInternalOverride(validInternal);
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('detects private field leakage when internal fields appear in public data', () => {
      const leakedPublic = {
        overrideId: 'ovr1',
        buildingKey: 'bldg_123',
        chunkId: 'station-5-2',
        sourceVersion: 'plateau-2023-lod3',
        operation: 'hide',
        reason: 'test',
        verifiedAt: '2026-11-15',
        revision: 1,
        status: 'published',
        contactInfo: { name: 'Secret User' },
        rawPhotoGps: { lat: 35.0, lon: 138.0 }
      };

      const leaks = detectPrivateFieldLeakage(leakedPublic);
      expect(leaks).toContain('contactInfo');
      expect(leaks).toContain('rawPhotoGps');

      const val = validatePublicOverride(leakedPublic);
      expect(val.valid).toBe(false);
      expect(val.errors.some(e => e.includes('Private internal fields leaked'))).toBe(true);
    });

    it('detects invalid records missing required fields or having bad enums', () => {
      // Missing buildingKey
      expect(validatePublicOverride({
        overrideId: 'ovr1',
        chunkId: 'station-5-2',
        sourceVersion: 'plateau-2023-lod3',
        operation: 'hide',
        reason: 'r',
        verifiedAt: '2026-11-15',
        revision: 1,
        status: 'published'
      }).valid).toBe(false);

      // Unknown operation
      expect(validatePublicOverride({
        overrideId: 'ovr1',
        buildingKey: 'b1',
        chunkId: 'station-5-2',
        sourceVersion: 'plateau-2023-lod3',
        operation: 'demolish_city',
        reason: 'r',
        verifiedAt: '2026-11-15',
        revision: 1,
        status: 'published'
      }).valid).toBe(false);

      // Invalid date format
      expect(validatePublicOverride({
        overrideId: 'ovr1',
        buildingKey: 'b1',
        chunkId: 'station-5-2',
        sourceVersion: 'plateau-2023-lod3',
        operation: 'hide',
        reason: 'r',
        verifiedAt: 'invalid-date',
        revision: 1,
        status: 'published'
      }).valid).toBe(false);
    });

    it('exports public release manifest with zero private leakage and filters draft records', () => {
      const draftInternal: BuildingOverrideInternal = {
        overrideId: 'ovr_draft',
        buildingKey: 'bldg_draft',
        chunkId: 'station-5-2',
        sourceVersion: 'plateau-2023-lod3',
        operation: 'replace',
        reason: 'draft model',
        verifiedAt: '2026-11-15',
        revision: 1,
        status: 'draft',
        contactInfo: { name: 'Internal Draft' }
      };

      const manifest = exportPublicReleaseManifest(
        [validInternal, draftInternal],
        'release-2026-11-v2',
        'plateau-2023-lod3',
        'Stage 2 Test Release'
      );

      expect(manifest.releaseId).toBe('release-2026-11-v2');
      // Draft record must be excluded
      expect(manifest.overrides).toHaveLength(1);
      expect(manifest.overrides[0].overrideId).toBe('ovr_station-5-2_bldg_bcf81438');

      // Verify zero private field leaks
      const leaks = detectPrivateFieldLeakage(manifest);
      expect(leaks).toHaveLength(0);

      // Manifest validation passes
      expect(validateReleaseManifest(manifest).valid).toBe(true);
    });
  });

  describe('2. 対象棟のみ除去と衝突判定更新 (station-5-2 パイロット)', () => {
    const targetBuilding: BuildingRecord = {
      id: 'bldg_bcf81438-5aa2-4b93-bf9d-b81fec1adb28',
      year: 2023,
      lat: 35.095033,
      lon: 138.863917,
      center: [575.99, 51.53, -1501.39],
      min: [565.27, 43.88, -1510.84],
      max: [586.72, 63.77, -1491.94],
      baseY: 43.88,
      topY: 63.77,
      footprint: [
        [565.27, -1504.31],
        [575.79, -1508.03],
        [583.78, -1510.84],
        [586.72, -1502.5],
        [571.81, -1492.78],
        [569.57, -1491.94]
      ]
    };

    it('removes only the target building triangles while preserving neighbor and other structures', () => {
      const chunkGroup = new THREE.Group();

      // Target building mesh (centered around [575.99, 50, -1501.39])
      const targetGeo = new THREE.BoxGeometry(18, 16, 16);
      const targetMesh = new THREE.Mesh(targetGeo, new THREE.MeshBasicMaterial());
      targetMesh.position.set(575.99, 51.53, -1501.39);
      chunkGroup.add(targetMesh);

      // Neighbor building (city hall annex at ~[551, 47, -1533], 7.8m away)
      const neighborGeo = new THREE.BoxGeometry(20, 10, 20);
      const neighborMesh = new THREE.Mesh(neighborGeo, new THREE.MeshBasicMaterial());
      neighborMesh.position.set(551.0, 47.0, -1533.0);
      chunkGroup.add(neighborMesh);

      // Distant building
      const distantGeo = new THREE.BoxGeometry(15, 12, 15);
      const distantMesh = new THREE.Mesh(distantGeo, new THREE.MeshBasicMaterial());
      distantMesh.position.set(700.0, 50.0, -1600.0);
      chunkGroup.add(distantMesh);

      const targetInitialCount = targetGeo.index!.count;
      const neighborInitialCount = neighborGeo.index!.count;
      const distantInitialCount = distantGeo.index!.count;

      // Execute removal
      const res = removeBuildingGeometry(chunkGroup, targetBuilding);

      expect(res.trianglesRemoved).toBe(targetInitialCount / 3);
      // Target building mesh geometry index must now be empty
      expect(targetMesh.geometry.index!.count).toBe(0);

      // Neighbor and distant buildings must retain 100% of their geometry
      expect(neighborMesh.geometry.index!.count).toBe(neighborInitialCount);
      expect(distantMesh.geometry.index!.count).toBe(distantInitialCount);
    });

    it('updates collision: target site becomes passable while neighbor remains solid', () => {
      const chunkGroup = new THREE.Group();

      const targetGeo = new THREE.BoxGeometry(18, 16, 16);
      const targetMesh = new THREE.Mesh(targetGeo);
      targetMesh.position.set(575.99, 51.53, -1501.39);
      chunkGroup.add(targetMesh);

      const neighborGeo = new THREE.BoxGeometry(20, 10, 20);
      const neighborMesh = new THREE.Mesh(neighborGeo);
      neighborMesh.position.set(551.0, 47.0, -1533.0);
      chunkGroup.add(neighborMesh);

      chunkGroup.updateMatrixWorld(true);

      // Raycast across target building site
      const rayTarget = new THREE.Raycaster(
        new THREE.Vector3(575.99, 50.0, -1525.0),
        new THREE.Vector3(0, 0, 1),
        0,
        50
      );

      // Raycast across neighbor building site
      const rayNeighbor = new THREE.Raycaster(
        new THREE.Vector3(551.0, 47.0, -1550.0),
        new THREE.Vector3(0, 0, 1),
        0,
        50
      );

      // Before removal: both hit
      expect(rayTarget.intersectObjects(chunkGroup.children, true).length).toBeGreaterThan(0);
      expect(rayNeighbor.intersectObjects(chunkGroup.children, true).length).toBeGreaterThan(0);

      // Perform removal
      removeBuildingGeometry(chunkGroup, targetBuilding);

      // After removal: target site has NO hits (pass-through confirmed)
      expect(rayTarget.intersectObjects(chunkGroup.children, true).length).toBe(0);

      // Neighbor STILL has solid collision
      expect(rayNeighbor.intersectObjects(chunkGroup.children, true).length).toBeGreaterThan(0);
    });
  });

  describe('3. 版の管理、不一致検出、および旧版への戻し (Rollback)', () => {
    it('detects sourceVersion mismatch and activates safe fallback mode', () => {
      const manager = new BuildingOverrideManager('release-2026-11-v2', EXPECTED_SOURCE_VERSION);

      const mismatchedManifest = {
        releaseId: 'release-2026-11-v2',
        sourceVersion: 'plateau-2024-lod3', // Incompatible new year dataset!
        updatedAt: '2026-11-15',
        description: 'Mismatched version release',
        overrides: [{
          overrideId: 'ovr1',
          buildingKey: 'bldg_bcf81438-5aa2-4b93-bf9d-b81fec1adb28',
          chunkId: 'station-5-2',
          sourceVersion: 'plateau-2024-lod3',
          operation: 'hide' as const,
          reason: 'test',
          verifiedAt: '2026-11-15',
          revision: 1,
          status: 'published' as const
        }]
      };

      const accepted = manager.setManifest(mismatchedManifest);
      expect(accepted).toBe(false);
      expect(manager.isFallbackMode()).toBe(true);
      expect(manager.getFallbackReason()).toContain('Version mismatch detected');

      // In fallback mode, overrides are safely suppressed
      expect(manager.getOverridesForChunk('station-5-2')).toHaveLength(0);
      expect(manager.getOverrideForBuilding('bldg_bcf81438-5aa2-4b93-bf9d-b81fec1adb28')).toBeNull();
      // getChunkUrl falls back to original defaultUrl
      expect(manager.getChunkUrl('station-5-2', 'default.glb')).toBe('default.glb');
    });

    it('allows reverting to base release (release-2026-11-v1) and restoring original chunk', () => {
      const manager = new BuildingOverrideManager('release-2026-11-v2', EXPECTED_SOURCE_VERSION);

      const validManifest = {
        releaseId: 'release-2026-11-v2',
        sourceVersion: EXPECTED_SOURCE_VERSION,
        updatedAt: '2026-11-15',
        description: 'Stage 2 Pilot',
        overrides: [{
          overrideId: 'ovr_pilot',
          buildingKey: 'bldg_bcf81438-5aa2-4b93-bf9d-b81fec1adb28',
          chunkId: 'station-5-2',
          sourceVersion: EXPECTED_SOURCE_VERSION,
          operation: 'hide' as const,
          reason: 'test',
          verifiedAt: '2026-11-15',
          revision: 1,
          status: 'published' as const
        }],
        chunkOverrides: {
          'station-5-2': {
            chunkId: 'station-5-2',
            regeneratedUrl: 'data/2023-lod3-station-5-2-ovr1-packed.glb',
            overrideIds: ['ovr_pilot']
          }
        }
      };

      manager.setManifest(validManifest);
      expect(manager.getActiveReleaseId()).toBe('release-2026-11-v2');
      expect(manager.getOverridesForChunk('station-5-2')).toHaveLength(1);
      expect(manager.getChunkUrl('station-5-2', 'default.glb')).toBe('data/2023-lod3-station-5-2-ovr1-packed.glb');

      // Revert to original (release-2026-11-v1)
      manager.revertToOriginal();
      expect(manager.getActiveReleaseId()).toBe(BASE_RELEASE_ID);
      expect(manager.isFallbackMode()).toBe(true);
      // No overrides are applied
      expect(manager.getOverridesForChunk('station-5-2')).toHaveLength(0);
      // Chunk URL reverts to original default
      expect(manager.getChunkUrl('station-5-2', 'default.glb')).toBe('default.glb');
    });

    it('creates replacement model and collider for replace operation and disposes cleanly', () => {
      const sampleBuilding: BuildingRecord = {
        id: 'bldg_replace_test',
        year: 2023,
        lat: 35.095,
        lon: 138.863,
        center: [570, 50, -1500],
        min: [560, 44, -1510],
        max: [580, 60, -1490],
        baseY: 44,
        topY: 60,
        footprint: [[560, -1510], [580, -1510], [580, -1490], [560, -1490]]
      };

      const replacement = createReplacementBuildingModel(sampleBuilding);
      expect(replacement.root.name).toContain('replace-model-');
      expect(replacement.collider.name).toContain('replace-collider-');

      replacement.collider.updateMatrixWorld(true);

      // Verify bounds and collision mesh
      const ray = new THREE.Raycaster(
        new THREE.Vector3(570, 50, -1520),
        new THREE.Vector3(0, 0, 1),
        0,
        30
      );
      expect(ray.intersectObject(replacement.collider, true).length).toBeGreaterThan(0);

      // Clean disposal
      replacement.dispose();
    });
  });

});
