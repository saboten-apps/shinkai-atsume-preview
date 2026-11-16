/**
 * BuildingOverride Manager & Geometry Modifier
 *
 * Implements Stage 2 Specification (NEXT-DEVELOPMENT-DESIGN.md §3, §7, §8):
 * - Targeted removal of source buildings without hiding or sinking the whole chunk
 * - Accurate collision update (pass-through where removed, intact neighbor collision)
 * - Version mismatch detection with safe fallback to original base data
 * - Rollback mechanism to revert to old version (release-2026-11-v1)
 * - Replacement model attachment and collider registration for 'replace'
 */

import * as THREE from 'three';
import type { BuildingRecord, BuildingSelectionManager } from './buildingSelection';
import type { BuildingOverridePublic, ReleaseManifest } from '../types/buildingOverride';
import { validateReleaseManifest } from '../types/buildingOverride';
import { BYUUO, createByuuo } from './byuuo';

export const BASE_RELEASE_ID = 'release-2026-11-v1';
export const DEFAULT_ACTIVE_RELEASE_ID = 'release-2026-11-v3-reviewed';
export const EXPECTED_SOURCE_VERSION = 'plateau-2023-lod3';

export interface OverrideApplyResult {
  removedCount: number;
  trianglesRemoved: number;
  replacedModels: THREE.Object3D[];
  update?: (viewer: THREE.Vector3) => void;
  dispose: () => void;
}

/**
 * 原本の建物IDおよび領域情報に基づいて、チャンクメッシュから対象棟の面（ポリゴン）のみを除外
 * 他の392棟のマテリアル割り当てやドローグループ、UVを一切壊さず安全に更新
 */
export function removeBuildingGeometry(
  group: THREE.Group,
  bounds: { min: number[]; max: number[]; baseY: number; topY: number; footprint?: [number, number][] }
): { trianglesRemoved: number; meshesModified: number } {
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  group.traverse(o => {
    if (o instanceof THREE.Mesh && o.geometry && o.geometry.getAttribute('position')) {
      meshes.push(o);
    }
  });

  let totalRemoved = 0;
  let modifiedCount = 0;

  const minX = bounds.min[0] - 0.5;
  const maxX = bounds.max[0] + 0.5;
  const minZ = bounds.min[2] - 0.5;
  const maxZ = bounds.max[2] + 0.5;
  // 高さマージン（基部 -1m、天面 +2m）
  const minY = bounds.baseY - 1.0;
  const maxY = bounds.topY + 2.5;

  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const index = geometry.index;
    const pos = geometry.getAttribute('position');
    const oldGroups = geometry.groups.length > 0
      ? geometry.groups
      : [{ start: 0, count: index ? index.count : pos.count, materialIndex: 0 }];

    const newIndices: number[] = [];
    const newGroups: Array<{ start: number; count: number; materialIndex: number }> = [];
    let meshRemoved = 0;

    for (const draw of oldGroups) {
      const groupStart = newIndices.length;
      for (let i = draw.start; i < draw.start + draw.count; i += 3) {
        const i0 = index ? index.getX(i) : i;
        const i1 = index ? index.getX(i + 1) : i + 1;
        const i2 = index ? index.getX(i + 2) : i + 2;

        const v0 = new THREE.Vector3().fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
        const v1 = new THREE.Vector3().fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
        const v2 = new THREE.Vector3().fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);

        const cx = (v0.x + v1.x + v2.x) / 3;
        const cy = (v0.y + v1.y + v2.y) / 3;
        const cz = (v0.z + v1.z + v2.z) / 3;

        // 対象棟の境界内（AABB）にあるか判定
        if (
          cx >= minX && cx <= maxX &&
          cz >= minZ && cz <= maxZ &&
          cy >= minY && cy <= maxY
        ) {
          meshRemoved++;
          continue;
        }

        newIndices.push(i0, i1, i2);
      }

      if (newIndices.length > groupStart) {
        newGroups.push({
          start: groupStart,
          count: newIndices.length - groupStart,
          materialIndex: draw.materialIndex ?? 0
        });
      }
    }

    if (meshRemoved > 0) {
      geometry.setIndex(newIndices);
      geometry.clearGroups();
      for (const g of newGroups) geometry.addGroup(g.start, g.count, g.materialIndex);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      totalRemoved += meshRemoved;
      modifiedCount++;
    }
  }

  return { trianglesRemoved: totalRemoved, meshesModified: modifiedCount };
}

/**
 * 'replace' 操作用の軽量プロシージャル置換モデルを生成
 */
export function createReplacementBuildingModel(building: BuildingRecord): {
  root: THREE.Group;
  collider: THREE.Group;
  dispose: () => void;
} {
  const root = new THREE.Group();
  root.name = `replace-model-${building.id}`;
  root.position.set(building.center[0], building.baseY, building.center[2]);

  const collider = new THREE.Group();
  collider.name = `replace-collider-${building.id}`;
  collider.position.copy(root.position);

  const width = Math.max(5, (building.max[0] - building.min[0]) * 0.9);
  const depth = Math.max(5, (building.max[2] - building.min[2]) * 0.9);
  const height = Math.max(4, (building.topY - building.baseY) * 0.85);

  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x90a4ae,
    roughness: 0.7,
    metalness: 0.1
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.set(0, height / 2, 0);
  root.add(bodyMesh);

  // コライダー（衝突判定用ボックス）
  const colGeo = new THREE.BoxGeometry(width, height, depth);
  const colMesh = new THREE.Mesh(colGeo);
  colMesh.position.set(0, height / 2, 0);
  collider.add(colMesh);

  // 屋上アクセント
  const roofGeo = new THREE.BoxGeometry(width * 0.8, 1.2, depth * 0.8);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.9 });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.set(0, height + 0.6, 0);
  root.add(roofMesh);

  return {
    root,
    collider,
    dispose: () => {
      bodyGeo.dispose();
      bodyMat.dispose();
      roofGeo.dispose();
      roofMat.dispose();
      colGeo.dispose();
    }
  };
}

export class BuildingOverrideManager {
  private activeReleaseId: string = DEFAULT_ACTIVE_RELEASE_ID;
  private expectedSourceVersion: string = EXPECTED_SOURCE_VERSION;
  private manifest: ReleaseManifest | null = null;
  private fallbackMode: boolean = false;
  private fallbackReason: string = '';
  private overrides = new Map<string, BuildingOverridePublic>(); // key: buildingKey

  constructor(activeReleaseId: string = DEFAULT_ACTIVE_RELEASE_ID, expectedSourceVersion: string = EXPECTED_SOURCE_VERSION) {
    this.activeReleaseId = activeReleaseId;
    this.expectedSourceVersion = expectedSourceVersion;
  }

  /**
   * 修正台帳 (ReleaseManifest) をロードして整合性を検証
   */
  async loadManifest(baseUrl: string): Promise<boolean> {
    try {
      const url = `${baseUrl}data/release-manifest.json`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[BuildingOverrideManager] Failed to fetch release manifest: HTTP ${res.status}`);
        return false;
      }
      const data = await res.json() as ReleaseManifest;
      return this.setManifest(data);
    } catch (err) {
      console.warn('[BuildingOverrideManager] Error loading release manifest:', err);
      return false;
    }
  }

  /**
   * マニフェストを設定し、原本版との版不一致を検証
   */
  setManifest(manifest: ReleaseManifest): boolean {
    this.manifest = manifest;
    this.overrides.clear();

    if (!validateReleaseManifest(manifest).valid ||
        (this.activeReleaseId !== BASE_RELEASE_ID && manifest.releaseId !== this.activeReleaseId) ||
        manifest.overrides.some(o => o.sourceVersion !== manifest.sourceVersion)) {
      this.fallbackMode = true;
      this.fallbackReason = 'Invalid or incompatible release manifest; using original buildings.';
      return false;
    }

    // 版不一致の検出: sourceVersion が期待する PLATEAU原本版と一致するか検証
    if (manifest.sourceVersion !== this.expectedSourceVersion) {
      this.fallbackMode = true;
      this.fallbackReason = `Version mismatch detected: manifest sourceVersion '${manifest.sourceVersion}' does not match expected '${this.expectedSourceVersion}'. Safe fallback to original base data activated.`;
      console.warn(`[BuildingOverrideManager] ${this.fallbackReason}`);
      return false;
    }

    // 版の一致を確認できた場合、公開overridesをインデックス化
    for (const ovr of manifest.overrides) {
      if (ovr.status === 'published') {
        this.overrides.set(ovr.buildingKey, ovr);
      }
    }

    this.fallbackMode = false;
    this.fallbackReason = '';
    return true;
  }

  /**
   * 現在のアクティブな releaseId を取得
   */
  getActiveReleaseId(): string {
    return this.activeReleaseId;
  }

  /**
   * 区画 GLB の配信 URL を取得
   * 再生成された区画アセットが存在し、かつアクティブな場合は再生成URLを返す。
   * 旧版 (release-2026-11-v1) または版不一致フォールバック時は原本 URL を返す。
   */
  getChunkUrl(chunkId: string, defaultUrl: string): string {
    if (this.isFallbackMode() || this.activeReleaseId === BASE_RELEASE_ID) {
      return defaultUrl;
    }
    const chunkOverride = this.manifest?.chunkOverrides?.[chunkId];
    if (chunkOverride?.regeneratedUrl) {
      return chunkOverride.regeneratedUrl;
    }
    return defaultUrl;
  }

  /**
   * releaseId を切り替える
   * 旧版 (release-2026-11-v1) に切り替えた場合は修正台帳を無効化（原本表示）
   */
  setReleaseId(releaseId: string): void {
    this.activeReleaseId = releaseId;
  }

  /**
   * 旧版（原本データ）へ戻す
   */
  revertToOriginal(): void {
    this.activeReleaseId = BASE_RELEASE_ID;
  }

  /**
   * 版不一致による安全側フォールバックが有効か
   */
  isFallbackMode(): boolean {
    return this.fallbackMode || (this.activeReleaseId === BASE_RELEASE_ID);
  }

  getFallbackReason(): string {
    return this.fallbackReason;
  }

  /**
   * 指定建物の修正情報を取得
   */
  getOverrideForBuilding(buildingKey: string): BuildingOverridePublic | null {
    if (this.isFallbackMode()) return null;
    return this.overrides.get(buildingKey) ?? null;
  }

  /**
   * 指定建物にアクティブな修正が適用されているか
   */
  isOverrideActive(buildingKey: string): boolean {
    if (this.isFallbackMode()) return false;
    return this.overrides.has(buildingKey);
  }

  /**
   * 指定区画のアクティブな修正一覧を取得
   */
  getOverridesForChunk(chunkId: string): BuildingOverridePublic[] {
    if (this.isFallbackMode()) return [];
    const list: BuildingOverridePublic[] = [];
    for (const ovr of this.overrides.values()) {
      if (ovr.chunkId === chunkId) {
        list.push(ovr);
      }
    }
    return list;
  }

  /**
   * チャンク読み込み時に修正を適用
   * - hide: 対象面を除去（描画と衝突の両方から除外）
   * - replace: 対象面を除去し、別アセット置換モデルを追加、衝突形状を更新
   */
  applyOverridesToChunk(
    chunkId: string,
    group: THREE.Group,
    selectionManager: BuildingSelectionManager,
    scene: THREE.Scene,
    addCollider: (group: THREE.Group) => (() => void) | void,
    preRegenerated = false
  ): OverrideApplyResult {
    const chunkOverrides = this.getOverridesForChunk(chunkId);
    if (chunkOverrides.length === 0) {
      return {
        removedCount: 0,
        trianglesRemoved: 0,
        replacedModels: [],
        dispose: () => {}
      };
    }

    let totalTrianglesRemoved = 0;
    let appliedCount = 0;
    const cleanups: Array<() => void> = [];
    const updateCallbacks: Array<(viewer: THREE.Vector3) => void> = [];
    const replacedModels: THREE.Object3D[] = [];

    for (const ovr of chunkOverrides) {
      const building = selectionManager.getBuildingById(ovr.buildingKey);
      const isByuuo = ovr.buildingKey === BYUUO.originalGmlId;
      if (!building && !(preRegenerated && (isByuuo || ovr.operation === 'hide'))) {
        console.warn(`[BuildingOverrideManager] Target building not found in chunk sidecar: ${ovr.buildingKey}`);
        continue;
      }

      if (ovr.operation === 'hide' || ovr.operation === 'replace') {
        // Regenerated GLBs already exclude the reviewed source building. Do not cut their
        // neighbours again using an approximate bounding box at runtime.
        const removeRes = preRegenerated ? { trianglesRemoved: 0 } : removeBuildingGeometry(group, building!);
        if (removeRes.trianglesRemoved > 0) {
          totalTrianglesRemoved += removeRes.trianglesRemoved;
          appliedCount++;
        }

        if (ovr.operation === 'replace') {
          if (isByuuo) {
            const byuuo = createByuuo();
            scene.add(byuuo.root);
            const removeCol = addCollider(byuuo.collider);
            replacedModels.push(byuuo.root);
            updateCallbacks.push((v: THREE.Vector3) => byuuo.update(v));

            cleanups.push(() => {
              scene.remove(byuuo.root);
              if (typeof removeCol === 'function') removeCol();
              byuuo.dispose();
            });
          } else {
            const replacement = createReplacementBuildingModel(building!);
            scene.add(replacement.root);
            const removeCol = addCollider(replacement.collider);
            replacedModels.push(replacement.root);

            cleanups.push(() => {
              scene.remove(replacement.root);
              if (typeof removeCol === 'function') removeCol();
              replacement.dispose();
            });
          }
        }
      }
    }

    return {
      removedCount: appliedCount,
      trianglesRemoved: totalTrianglesRemoved,
      replacedModels,
      update: updateCallbacks.length > 0 ? (viewer: THREE.Vector3) => {
        for (const cb of updateCallbacks) cb(viewer);
      } : undefined,
      dispose: () => {
        for (const cleanup of cleanups) cleanup();
      }
    };
  }
}
