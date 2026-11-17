import * as THREE from 'three';

export interface BuildingRecord {
  id: string; // 原本の gml_id (e.g. "bldg_dd76ee2b-...")
  year: number; // 2023
  lat: number;
  lon: number;
  center: [number, number, number]; // [x, y, z] ENU
  min: [number, number, number]; // [minX, baseY, minZ]
  max: [number, number, number]; // [maxX, topY, maxZ] (1.3倍高さ反映後)
  baseY: number;
  topY: number;
  footprint: [number, number][]; // [[x, z], ...]
  isCityHall?: boolean;
}

export interface ChunkBuildingSelection {
  chunk: string;
  year: number;
  count: number;
  buildings: BuildingRecord[];
}

/**
 * 2D Point-in-Polygon (Ray casting algorithm)
 */
export function isPointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * 水平距離: 点 (x, z) から多角形境界までの最短距離
 */
export function distanceToPolygon(x: number, z: number, poly: [number, number][]): number {
  if (poly.length === 0) return Infinity;
  let minD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const x1 = poly[j][0], z1 = poly[j][1];
    const x2 = poly[i][0], z2 = poly[i][1];
    const dx = x2 - x1, dz = z2 - z1;
    const l2 = dx * dx + dz * dz;
    let t = l2 === 0 ? 0 : ((x - x1) * dx + (z - z1) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx, pz = z1 + t * dz;
    const d = Math.hypot(x - px, z - pz);
    if (d < minD) minD = d;
  }
  return minD;
}

const WALL_PROBE_M = 0.75;
function wallOwner(candidates: BuildingRecord[], x: number, z: number, normal?: THREE.Vector3): BuildingRecord | null {
  if (!normal || Math.abs(normal.y) > 0.7) return null;
  const length = Math.hypot(normal.x, normal.z);
  if (length < 1e-6) return null;
  const nx = normal.x / length * WALL_PROBE_M, nz = normal.z / length * WALL_PROBE_M;
  const owners = candidates.filter(c =>
    isPointInPolygon(x - nx, z - nz, c.footprint) && !isPointInPolygon(x + nx, z + nz, c.footprint));
  return owners.length === 1 ? owners[0] : null;
}

export class BuildingSelectionManager {
  private chunks = new Map<string, ChunkBuildingSelection>();
  private pending = new Map<string, { controller: AbortController; promise: Promise<boolean> }>();
  private disposed = false;

  /**
   * 区画の選択メタデータを非同期ロード
   */
  async loadChunk(chunkId: string, baseUrl: string): Promise<boolean> {
    if (this.disposed) return false;
    if (this.chunks.has(chunkId)) return true;
    const existing = this.pending.get(chunkId);
    if (existing) return existing.promise;
    const controller = new AbortController();
    const promise = (async () => { try {
      const url = `${baseUrl}data/buildings-${chunkId}.json`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return false;
      const data = await res.json() as ChunkBuildingSelection;
      if (this.disposed || controller.signal.aborted || data.chunk !== chunkId || data.year !== 2023 || !Array.isArray(data.buildings)) return false;
      this.chunks.set(chunkId, data);
      return true;
    } catch {
      return false;
    } finally {
      if (this.pending.get(chunkId)?.controller === controller) this.pending.delete(chunkId);
    } })();
    this.pending.set(chunkId, {controller, promise});
    return promise;
  }

  /**
   * 区画アンロード時にメモリから解放
   */
  unloadChunk(chunkId: string): void {
    this.pending.get(chunkId)?.controller.abort();
    this.pending.delete(chunkId);
    this.chunks.delete(chunkId);
  }

  /**
   * 指定区画が読み込まれているか
   */
  hasChunk(chunkId: string): boolean {
    return this.chunks.has(chunkId);
  }

  /**
   * 読み込み済み区画数
   */
  get loadedChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * 読み込み済み全建物数
   */
  get totalBuildingCount(): number {
    let count = 0;
    for (const c of this.chunks.values()) count += c.buildings.length;
    return count;
  }

  /**
   * レイキャスト交差点 (hitPoint) から該当建物を検索
   */
  findBuilding(hitPoint: THREE.Vector3, surfaceNormal?: THREE.Vector3): BuildingRecord | null {
    const x = hitPoint.x;
    const y = hitPoint.y;
    const z = hitPoint.z;

    // 候補建物を収集（全ロード済み区画）
    const candidates: BuildingRecord[] = [];
    for (const chunk of this.chunks.values()) {
      for (const b of chunk.buildings) {
        // AABB による粗判定（マージン 1.5m）
        if (
          x >= b.min[0] - 1.5 && x <= b.max[0] + 1.5 &&
          z >= b.min[2] - 1.5 && z <= b.max[2] + 1.5 &&
          y >= b.baseY - 1.0 && y <= b.topY + 1.5
        ) {
          candidates.push(b);
        }
      }
    }

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // A wall belongs to the building whose outline it sits on: just behind the surface is
    // inside that outline and just in front is outside. Outlines are convex hulls, so a
    // neighbour's wall can lie inside a larger building's hull; containment alone would
    // then name the larger building. Used only when exactly one candidate fits.
    const wall = wallOwner(candidates, x, z, surfaceNormal);
    if (wall) return wall;

    // 水平多角形の内外判定
    const inPoly = candidates.filter(c => isPointInPolygon(x, z, c.footprint));
    if (inPoly.length === 1) return inPoly[0];
    if (inPoly.length > 1) {
      // 複数重複している場合（長屋や複合建築）、中心までの水平距離が近い方を優先
      let best = inPoly[0];
      let bestD = Infinity;
      for (const c of inPoly) {
        const d = Math.hypot(x - c.center[0], z - c.center[2]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    }

    // 壁面など多角形外側のわずかな境界部
    let best = candidates[0];
    let minD = Infinity;
    for (const c of candidates) {
      const d = distanceToPolygon(x, z, c.footprint);
      if (d < minD) {
        minD = d;
        best = c;
      }
    }

    // 境界から 2.5m 以内であれば壁面タップとして採用
    return minD < 2.5 ? best : null;
  }

  /**
   * ID で建物を直接検索
   */
  getBuildingById(id: string): BuildingRecord | null {
    for (const chunk of this.chunks.values()) {
      for (const b of chunk.buildings) {
        if (b.id === id) return b;
      }
    }
    return null;
  }

  /**
   * 選択ハイライト用 3D オブジェクトを生成
   */
  createHighlight(record: BuildingRecord | null): THREE.Object3D | null {
    if (!record) return null;

    const group = new THREE.Group();
    group.name = 'building-selection-highlight';

    // 1. 外形線（footprint の下底面と上天面、および垂直柱）
    const poly = record.footprint;
    const baseY = record.baseY + 0.1;
    const topY = record.topY + 0.2;

    const linePoints: THREE.Vector3[] = [];
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % n];

      // 下面ループ
      linePoints.push(new THREE.Vector3(p1[0], baseY, p1[1]));
      linePoints.push(new THREE.Vector3(p2[0], baseY, p2[1]));

      // 上面ループ
      linePoints.push(new THREE.Vector3(p1[0], topY, p1[1]));
      linePoints.push(new THREE.Vector3(p2[0], topY, p2[1]));

      // 垂直柱
      linePoints.push(new THREE.Vector3(p1[0], baseY, p1[1]));
      linePoints.push(new THREE.Vector3(p1[0], topY, p1[1]));
    }

    const lineGeom = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 2,
      depthTest: true,
      transparent: true,
      opacity: 0.95
    });
    const lines = new THREE.LineSegments(lineGeom, lineMat);
    group.add(lines);

    // 2. 半透明の天面マーカー
    const shape = new THREE.Shape();
    if (poly.length >= 3) {
      shape.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) {
        shape.lineTo(poly[i][0], poly[i][1]);
      }
      shape.closePath();

      const roofGeom = new THREE.ShapeGeometry(shape);
      roofGeom.rotateX(Math.PI / 2);
      roofGeom.translate(0, topY, 0);

      const roofMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const roofMesh = new THREE.Mesh(roofGeom, roofMat);
      group.add(roofMesh);
    }

    return group;
  }

  /**
   * 全リソースの破棄
   */
  dispose(): void {
    this.disposed = true;
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
    this.chunks.clear();
  }
}
