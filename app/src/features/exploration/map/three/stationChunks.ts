import * as THREE from 'three';
import { emphasizeBuildingHeights } from './buildingHeight';
import { brightenBuildingMaterial } from './buildingAppearance';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createNearBuildingPilot, NEAR_BUILDING_PILOT } from './nearBuildingPilot';
import { CITY_HALL, createCityHall, removeCityHallSource } from './cityHall';
import { BuildingSelectionManager } from './buildingSelection';
import { BuildingOverrideManager } from './buildingOverride';

type Chunk = { id: string; url: string; min: number[]; max: number[] };
export function streamStationBuildings(
  scene: THREE.Scene, loader: GLTFLoader, baseUrl: string,
  addCollider: (group: THREE.Group) => (() => void) | void,
  onStatus?: (text: string) => void,
) {
  const abort = new AbortController();
  const selectionManager = new BuildingSelectionManager();
  const overrideManager = new BuildingOverrideManager(scene.userData.releaseId);
  let pilot: ReturnType<typeof createNearBuildingPilot> | undefined;
  let hall: {model:ReturnType<typeof createCityHall>;removeCollider?:()=>void} | undefined;
  let chunks: Chunk[] = [], disposed = false, manifestFailed = false, loading = false, nextUpdate = 0;
  const focus = new THREE.Vector3();
  const loaded = new Map<string, {
    group: THREE.Group;
    removeCollider?: () => void;
    removeDetail?: () => void;
    removeOverride?: () => void;
    updateOverride?: (viewer: THREE.Vector3) => void;
    replacementTargets?: THREE.Object3D[];
  }>();
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
  const ready = Promise.all([
    fetch(`${baseUrl}data/station-manifest.json`, { signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Station manifest HTTP ${response.status}`);
        const manifest = await response.json() as { chunks: Chunk[] };
        if (!disposed) chunks = manifest.chunks;
      }),
    overrideManager.loadManifest(baseUrl)
  ]).catch(error => {
    if (!disposed) { manifestFailed = true; console.error('Station manifest:', error); onStatus?.('駅方面のデータを読み込めませんでした'); }
  });
  function update(position: THREE.Vector3, viewer:THREE.Vector3=position) {
    pilot?.update(viewer, scene.userData.nearBuildingPilot !== false);
    hall?.model.update(viewer);
    for (const entry of loaded.values()) {
      entry.updateOverride?.(viewer);
    }
    focus.copy(position);
    if (disposed || manifestFailed || performance.now() < nextUpdate) return;
    nextUpdate = performance.now() + 400;
    for (const chunk of chunks) {
      const entry = loaded.get(chunk.id);
      if (entry && distance(chunk) > 650) {
        if(chunk.id===CITY_HALL.chunk){hall?.removeCollider?.();hall?.model.dispose();hall=undefined;}
        if (chunk.id === NEAR_BUILDING_PILOT.chunk) { pilot?.dispose(); pilot = undefined; }
        selectionManager.unloadChunk(chunk.id);
        entry.removeOverride?.();entry.removeDetail?.();
        if (typeof entry.removeCollider === 'function') entry.removeCollider();
        release(entry.group); loaded.delete(chunk.id);
      }
    }
    if (loading) return;
    const chunk = chunks.filter(c => !loaded.has(c.id) && distance(c) < 350 && performance.now() >= (retryAt.get(c.id) ?? 0))
      .sort((a, b) => distance(a) - distance(b))[0];
    if (!chunk) {
      const waiting = chunks.some(c => distance(c) < 350 && retryAt.has(c.id));
      onStatus?.(waiting ? '街並みの読み込みを再試行しています…' : ''); return;
    }
    loading = true;
    onStatus?.('周辺の街並みを読み込み中…');
    const chunkUrl = overrideManager.getChunkUrl(chunk.id, chunk.url);
    const shouldLoadSidecar = scene.userData.adminMode === true;
    const sidecarPromise = shouldLoadSidecar ? selectionManager.loadChunk(chunk.id, baseUrl) : Promise.resolve(false);
    void Promise.all([
      loader.loadAsync(baseUrl + chunkUrl),
      sidecarPromise
    ]).then(([gltf]) => {
      if (disposed || distance(chunk) > 650) {
        selectionManager.unloadChunk(chunk.id);
        release(gltf.scene);
        return;
      }
      emphasizeBuildingHeights(gltf.scene);
      if(chunk.id===CITY_HALL.chunk){
        const removed=removeCityHallSource(gltf.scene);
        if(removed.components===2){
          const model=createCityHall();model.root.userData.replacedSource=removed;
          scene.add(model.root);model.update(viewer);
          hall={model,removeCollider:addCollider(model.collider)||undefined};
        }else console.warn('City hall source did not match; keeping original model');
      }

      // 修正台帳 (BuildingOverride) による対象棟の除去・置換および衝突判定更新
      const overrideResult = overrideManager.applyOverridesToChunk(
        chunk.id,
        gltf.scene,
        selectionManager,
        scene,
        addCollider,
        chunkUrl !== chunk.url
      );

      gltf.scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          brightenBuildingMaterial(material, scene.userData.maxTextureAnisotropy ?? 4);
        }
      });
      scene.add(gltf.scene);
      const rawCollider = addCollider(gltf.scene);
      const removeCollider = typeof rawCollider === 'function' ? rawCollider : undefined;
      const removeDetail=undefined;
      if (chunk.id === NEAR_BUILDING_PILOT.chunk) {
        pilot = createNearBuildingPilot(); scene.add(pilot.root);
        pilot.update(viewer, scene.userData.nearBuildingPilot !== false);
      }
      loaded.set(chunk.id, {
        group: gltf.scene,
        removeCollider,
        removeDetail,
        removeOverride: overrideResult.dispose,
        updateOverride: overrideResult.update,
        replacementTargets: overrideResult.replacedModels
      });
      retryAt.delete(chunk.id);
    }).catch(error => {
      if (!disposed) { console.error(`Station chunk ${chunk.id}:`, error); retryAt.set(chunk.id, performance.now() + 10000); onStatus?.('街並みの読み込みを再試行しています…'); }
    }).finally(() => { loading = false; nextUpdate = 0; });
  }
  return {
    ready,
    update,
    detailReady:async()=>{await hall?.model.photoReady();},
    selectionManager,
    overrideManager,
    setAdminMode(enabled: boolean) {
      scene.userData.adminMode = enabled;
      if (enabled) {
        for (const chunkId of loaded.keys()) {
          if (!selectionManager.hasChunk(chunkId)) {
            void selectionManager.loadChunk(chunkId, baseUrl);
          }
        }
      } else {
        for (const chunkId of loaded.keys()) {
          selectionManager.unloadChunk(chunkId);
        }
      }
    },
    async loadSelectionForLoadedChunks() {
      await Promise.all([...loaded.keys()].map(id=>selectionManager.loadChunk(id,baseUrl)));
    },
    loadedChunkCount: () => loaded.size,
    getBuildingTargets(): THREE.Object3D[] {
      const targets: THREE.Object3D[] = [];
      for (const entry of loaded.values()) targets.push(entry.group, ...(entry.replacementTargets ?? []));
      if (hall) targets.push(hall.model.root);
      return targets;
    },
    dispose() {
      disposed = true; abort.abort();
      pilot?.dispose(); pilot = undefined;
      hall?.removeCollider?.();hall?.model.dispose();hall=undefined;
      selectionManager.dispose();
      for (const entry of loaded.values()) {
        entry.removeOverride?.();
        entry.removeDetail?.();
        entry.removeCollider?.();
        release(entry.group);
      }
      loaded.clear();
    }
  };
}
