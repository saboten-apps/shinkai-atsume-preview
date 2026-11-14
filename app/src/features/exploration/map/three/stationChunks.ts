import * as THREE from 'three';
import { brightenBuildingMaterial } from './buildingAppearance';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type Chunk = { id: string; url: string; min: number[]; max: number[] };
export function streamStationBuildings(
  scene: THREE.Scene, loader: GLTFLoader, baseUrl: string,
  addCollider: (group: THREE.Group) => (() => void) | void,
  onStatus?: (text: string) => void,
) {
  const abort = new AbortController();
  let chunks: Chunk[] = [], disposed = false, manifestFailed = false, loading = false, nextUpdate = 0;
  const focus = new THREE.Vector3();
  const loaded = new Map<string, { group: THREE.Group; removeCollider?: () => void }>();
  const retryAt = new Map<string, number>();
  function release(group: THREE.Group) {
    scene.remove(group);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        if (material instanceof THREE.MeshStandardMaterial && material.map) textures.add(material.map);
      }
    });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    textures.forEach(t => { t.dispose(); t.image?.close?.(); });
  }
  const distance = (chunk: Chunk) => Math.hypot(
    Math.max(chunk.min[0] - focus.x, 0, focus.x - chunk.max[0]),
    Math.max(chunk.min[2] - focus.z, 0, focus.z - chunk.max[2]),
  );
  const ready = fetch(`${baseUrl}data/station-manifest.json`, { signal: abort.signal })
    .then(async response => {
      if (!response.ok) throw new Error(`Station manifest HTTP ${response.status}`);
      const manifest = await response.json() as { chunks: Chunk[] };
      if (!disposed) chunks = manifest.chunks;
    }).catch(error => {
      if (!disposed) { manifestFailed = true; console.error('Station manifest:', error); onStatus?.('駅方面のデータを読み込めませんでした'); }
    });
  function update(position: THREE.Vector3) {
    focus.copy(position);
    if (disposed || manifestFailed || performance.now() < nextUpdate) return;
    nextUpdate = performance.now() + 400;
    for (const chunk of chunks) {
      const entry = loaded.get(chunk.id);
      if (entry && distance(chunk) > 900) {
        entry.removeCollider?.(); release(entry.group); loaded.delete(chunk.id);
      }
    }
    if (loading) return;
    const chunk = chunks.filter(c => !loaded.has(c.id) && distance(c) < 500 && performance.now() >= (retryAt.get(c.id) ?? 0))
      .sort((a, b) => distance(a) - distance(b))[0];
    if (!chunk) {
      const waiting = chunks.some(c => distance(c) < 500 && retryAt.has(c.id));
      onStatus?.(waiting ? '街並みの読み込みを再試行しています…' : ''); return;
    }
    loading = true;
    onStatus?.('周辺の街並みを読み込み中…');
    void loader.loadAsync(baseUrl + chunk.url).then(gltf => {
      if (disposed || distance(chunk) > 900) { release(gltf.scene); return; }
      gltf.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          brightenBuildingMaterial(material);
        }
      });
      scene.add(gltf.scene);
      const removeCollider = addCollider(gltf.scene) || undefined;
      loaded.set(chunk.id, { group: gltf.scene, removeCollider });
      retryAt.delete(chunk.id);
    }).catch(error => {
      if (!disposed) { console.error(`Station chunk ${chunk.id}:`, error); retryAt.set(chunk.id, performance.now() + 10000); onStatus?.('街並みの読み込みを再試行しています…'); }
    }).finally(() => { loading = false; nextUpdate = 0; });
  }
  return { ready, update, dispose() {
    disposed = true; abort.abort();
    for (const entry of loaded.values()) { entry.removeCollider?.(); release(entry.group); }
    loaded.clear();
  } };
}
