import { createCityStructures } from './cityStructures';
import { styleRegionalLandscape } from './regionalLandscape';
import { createWaterSurface } from './waterSurface';
import { createAerialGround } from './aerialGround';
import { streamStationBuildings } from './stationChunks';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface SceneBuildResult {
  disposables: {
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material;
    texture?: THREE.Texture;
  }[];
  ready: Promise<void>;
  updateBuildings?: (position: THREE.Vector3, viewer?:THREE.Vector3) => void;
  updateWater?: (delta: number) => void;
  groundReady?: () => Promise<void>;
  isWaterAt: (x:number,z:number)=>boolean;
  dispose?: () => void;
}

/**
 * Load the complete port building model with original PLATEAU photo textures.
 * All available photographs stay applied at every viewing distance/height.
 * Surfaces without source photography retain their original neutral material.
 */
export function buildNumazuPortScene(
  scene: THREE.Scene,
  onProgress?: (loaded: number, total: number) => void,
  onCollisionGeometry?: (group: THREE.Group) => (() => void) | void,
  onAreaStatus?: (text: string) => void
): SceneBuildResult {
  let isDisposed = false;
  let city:ReturnType<typeof createCityStructures>|undefined;
  let aerial: ReturnType<typeof createAerialGround> | undefined;
  const disposables: {
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material;
    texture?: THREE.Texture;
  }[] = [];

  function track<T extends THREE.Object3D>(obj: T): T {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) disposables.push({ geometry: child.geometry });
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            disposables.push({ material: m });
            // テクスチャ（baseColorTexture, roughnessMap等）も破棄対象に登録
            if ('map' in m && m.map) disposables.push({ texture: m.map as THREE.Texture });
            if ('roughnessMap' in m && m.roughnessMap) disposables.push({ texture: m.roughnessMap as THREE.Texture });
          });
        }
      }
      if (child instanceof THREE.LineSegments) {
        if (child.geometry) disposables.push({ geometry: child.geometry });
        if (child.material) {
          disposables.push({ material: child.material as THREE.Material });
        }
      }
    });
    return obj;
  }

  const water = createWaterSurface(scene);

  // A shallow virtual floor, independent of real bathymetry. Hidden from aerial views.
  const virtualBed=new THREE.Mesh(new THREE.PlaneGeometry(5000,6500),new THREE.MeshStandardMaterial({color:0x426b69,roughness:1}));
  virtualBed.rotation.x=-Math.PI/2;virtualBed.position.set(0,27,-400);virtualBed.userData.virtualWaterBed=true;virtualBed.visible=false;scene.add(track(virtualBed));

  // --- 2. 周囲の敷き分け（南と東の地続き表現、y=41.55） ---
  // 生成り色の平面を y=41.55 に、z > +720 の南側一帯と x > +590 の東側一帯だけに敷く（地形範囲の外側）。
  const landExtensionMat = new THREE.MeshStandardMaterial({
    color: 0xcfc5ae, // 地形と同じ生成りサンド
    roughness: 1.0,
    metalness: 0.0,
  });

  // Cropped station terrain ends at z ≈ -2723. Continue inland as a plain
  // backdrop outside the data footprint, rather than showing an ocean there.
  const northLand = new THREE.Mesh(new THREE.PlaneGeometry(6000, 8000), landExtensionMat);
  northLand.rotation.x = -Math.PI / 2;
  northLand.position.set(0, 41.55, -6725);
  scene.add(track(northLand));

  // --- 3. PLATEAU実データ GLB の読み込み ---
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '') + '/map/';
  // Buildings, including the original port, stream separately by proximity.
  const roadUrl = `${baseUrl}data/corridor-road-packed.glb`;
  const terrainUrl = `${baseUrl}data/corridor-terrain-packed.glb`;
  const vegUrl = `${baseUrl}data/corridor-veg-packed.glb`;
  const waterSeaUrl = `${baseUrl}data/corridor-water-sea-packed.glb`;
  const waterRiverUrl = `${baseUrl}data/corridor-water-river-packed.glb`;

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const station = streamStationBuildings(scene, loader, baseUrl, group => onCollisionGeometry?.(group), onAreaStatus);

  let loadedCount = 0;
  const totalCount = 6;

  const loadGLTF = (url: string): Promise<THREE.Group> => {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          if (isDisposed) {
            gltf.scene.traverse(child => {
              if (!(child instanceof THREE.Mesh)) return;
              child.geometry.dispose();
              const materials = Array.isArray(child.material) ? child.material : [child.material];
              materials.forEach(material => {
                if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
                material.dispose();
              });
            });
            reject(new Error('Scene disposed during loading'));
            return;
          }
          loadedCount++;
          if (onProgress) onProgress(loadedCount, totalCount);
          track(gltf.scene); // Track original materials too, before the styling pass replaces them.
          resolve(gltf.scene);
        },
        undefined,
        (err) => {
          console.error(`Failed to load GLB from ${url}:`, err);
          reject(err);
        }
      );
    });
  };

  const regionalReady=loadGLTF(`${import.meta.env.BASE_URL}environment/numazu-region.glb`)
    .then(group=>{
      if(isDisposed)return;
      styleRegionalLandscape(group);
      group.visible=!scene.userData.underwater;
      scene.add(group);
    })
    .catch(error=>{if(!isDisposed)console.warn('Regional landscape unavailable:',error);});

  const ready = Promise.all([
    loadGLTF(roadUrl),
    loadGLTF(terrainUrl),
    loadGLTF(vegUrl),
    loadGLTF(waterSeaUrl),
    loadGLTF(waterRiverUrl),
  ])
    .then(([roadScene, terrainScene, vegScene, waterSeaScene, waterRiverScene]) => {
      // Keep photographic lane markings visible through a subtle asphalt tint.
      roadScene.position.y += 0.4;
      roadScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x39414a,
            transparent: true,
            opacity: .16,
            depthWrite: false,
            roughness: 0.9,
            metalness: 0,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          });
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      roadScene.userData.waterTerrain=true;
      roadScene.traverse(child=>{child.userData.waterTerrain=true;});
      scene.add(track(roadScene));
      onCollisionGeometry?.(roadScene);

      // 3) 地形（DEM TIN）: 生成りサンド（0xcfc5ae）、roughness 1.0
      terrainScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xcfc5ae,
            roughness: 1.0,
            metalness: 0.0,
          });
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      terrainScene.userData.waterTerrain=true;
      terrainScene.traverse(child=>{child.userData.waterTerrain=true;});
      scene.add(track(terrainScene));
      onCollisionGeometry?.(terrainScene);


      // 4) 植生（VEG）: 深緑（0x243e2b）、roughness 1.0
      vegScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x243e2b,
            roughness: 1.0,
            metalness: 0.0,
          });
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      scene.add(track(vegScene));

      waterSeaScene.position.y = 41.55;
      waterRiverScene.position.y = 41.62;
      water.attach(waterSeaScene);
      water.attach(waterRiverScene);
      scene.add(waterSeaScene,waterRiverScene);
      city=createCityStructures(scene,terrainScene,roadScene,onCollisionGeometry);
      aerial = createAerialGround(scene, terrainScene, [waterSeaScene, waterRiverScene]);
      aerial.maskRoads(roadScene);
      water.setShoreMask(aerial.waterMask,aerial.maskBounds);
      void aerial.ready.catch(error => { if(!isDisposed) console.warn('Ground photos unavailable:', error); });
    })
    .catch((err) => {
      if (!isDisposed) console.error('Error during PLATEAU real data integration:', err);
      throw err;
    });

  const dispose = () => {
    isDisposed = true;
    station.dispose();
    city?.dispose();
    aerial?.dispose();
    water.dispose();
    disposables.forEach((item) => {
      if (item.geometry) item.geometry.dispose();
      if (item.material) item.material.dispose();
      if (item.texture) item.texture.dispose();
    });
  };

  return { disposables, ready: Promise.all([ready, station.ready,regionalReady]).then(() => {}), updateWater: water.update, updateBuildings: (position,viewer) => { station.update(position,viewer); aerial?.update(position); }, groundReady: async () => { await aerial?.settled(); await station.detailReady(); }, isWaterAt:(x,z)=>aerial?.isWaterAt(x,z)??true, dispose };
}
