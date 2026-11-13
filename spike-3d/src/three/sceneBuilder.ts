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
  updateWater?: (delta: number) => void;
  dispose?: () => void;
}

/**
 * 水面の微細なさざ波・うねりを表現するシームレス（ラップアラウンド可能）なノイズテクスチャを自前生成。
 * 整数周波数のサイン波を合成し、テクスチャ境界（u=0/1, v=0/1）で完全に連続。
 * コントラストを抑え（roughness 0.25〜0.55）、静止画でも色判別を阻害せずハイライトの揺らぎのみを表現する。
 */
function createWaterNoiseTexture(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const raw = new Float32Array(size * size);

  const waves = [
    { kx: 1, kz: 1, amp: 0.22, phase: 0.3 },
    { kx: 2, kz: -1, amp: 0.18, phase: 1.1 },
    { kx: -1, kz: 2, amp: 0.16, phase: 2.4 },
    { kx: 3, kz: 2, amp: 0.12, phase: 0.7 },
    { kx: 2, kz: -3, amp: 0.10, phase: 1.9 },
    { kx: -3, kz: -1, amp: 0.09, phase: 3.1 },
    { kx: 4, kz: 1, amp: 0.07, phase: 0.5 },
    { kx: 1, kz: -4, amp: 0.06, phase: 2.8 },
  ];

  let minVal = Infinity;
  let maxVal = -Infinity;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      let val = 0;
      for (const w of waves) {
        val += w.amp * Math.sin(2 * Math.PI * (w.kx * u + w.kz * v) + w.phase);
      }
      raw[y * size + x] = val;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }
  }

  const range = maxVal - minVal || 1;
  const targetMin = 0.25;
  const targetMax = 0.55;

  for (let i = 0; i < size * size; i++) {
    const norm = (raw[i] - minVal) / range;
    const rough = targetMin + norm * (targetMax - targetMin);
    const byteVal = Math.round(rough * 255);
    const idx = i * 4;
    data[idx] = byteVal;     // R
    data[idx + 1] = byteVal; // G (Three.js MeshStandardMaterial reads roughness from G)
    data[idx + 2] = byteVal; // B
    data[idx + 3] = 255;     // A
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 水面GLBにはTEXCOORD_0（UV）が含まれないため、ワールドENU座標 (x, z) から一貫したスケールでUVを生成
 */
function ensureWaterUVCoordinates(geometry: THREE.BufferGeometry, scale = 0.04) {
  if (!geometry.attributes.uv) {
    const pos = geometry.attributes.position;
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uvs[i * 2] = pos.getX(i) * scale;
      uvs[i * 2 + 1] = pos.getZ(i) * scale;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
}

/**
 * PLATEAU実データ（沼津港周辺 建物頂点カラー・道路・DEM地形・VEG植生・海/川水面、および目印建物実テクスチャ版）と周囲環境を構築
 * - 第4弾統合:
 *   1. 建物初期表示: port-bldg-color-nohero-packed.glb（目印建物49棟を除いた476棟、370KB、屋根 #777C7C／外壁 #CFCEC8）
 *   2. 目印建物実テクスチャ: port-bldg-hero-tex-packed.glb（49棟・実写真テクスチャ内蔵、1.27MB）を初期表示完了後に遅延ロード
 *   3. ヒーロー版マテリアル: GLB内蔵テクスチャと中立グレー頂点カラーをそのまま活用（生成りティントなし）
 *   4. 水面・周囲環境: 第3弾仕様（海・川分離、自前ノイズ roughnessMap、UVスクロールアニメーション）を完全維持
 */
export function buildNumazuPortScene(
  scene: THREE.Scene,
  onProgress?: (loaded: number, total: number) => void
): SceneBuildResult {
  const disposables: {
    geometry?: THREE.BufferGeometry;
    material?: THREE.Material;
    texture?: THREE.Texture;
  }[] = [];

  let isDisposed = false;
  let delayedLoadTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let idleCallbackId: number | null = null;

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

  // --- 水面 roughnessMap ノイズテクスチャ（海用・川用） ---
  const seaRoughnessMap = createWaterNoiseTexture(128);
  const riverRoughnessMap = createWaterNoiseTexture(128);
  disposables.push({ texture: seaRoughnessMap }, { texture: riverRoughnessMap });

  // --- 1. 海面（濃紺平面 2400×2400 全面、y=41.5） ---
  // 指示書: 海の全面平面（従来の濃紺プレーン）は色を #183B52 に合わせて残す（y=41.5）。
  // その上に水面ポリゴン（海）を重ね、内港・河口・港沖の水際をデータどおりに読めるようにする。
  const seaGeom = new THREE.PlaneGeometry(2400, 2400, 8, 8);
  // 全面平面のUVもワールドENU座標スケール（0.04）に合わせてシームレスに同期
  const seaPos = seaGeom.attributes.position;
  const seaUv = seaGeom.attributes.uv;
  for (let i = 0; i < seaPos.count; i++) {
    const lx = seaPos.getX(i);
    const ly = seaPos.getY(i);
    // rotation.x = -Math.PI / 2 のため、ワールド x = lx, z = -ly
    seaUv.setXY(i, lx * 0.04, -ly * 0.04);
  }
  seaUv.needsUpdate = true;

  const seaMat = new THREE.MeshStandardMaterial({
    color: 0x183b52, // #183B52 に統一
    roughness: 0.35,
    metalness: 0.1,
    roughnessMap: seaRoughnessMap,
  });
  const sea = new THREE.Mesh(seaGeom, seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 41.5, 0);
  sea.receiveShadow = false;
  scene.add(track(sea));

  // --- 2. 周囲の敷き分け（南と東の地続き表現、y=41.55） ---
  // 生成り色の平面を y=41.55 に、z > +720 の南側一帯と x > +590 の東側一帯だけに敷く（地形範囲の外側）。
  const landExtensionMat = new THREE.MeshStandardMaterial({
    color: 0xcfc5ae, // 地形と同じ生成りサンド
    roughness: 1.0,
    metalness: 0.0,
  });

  // 東側一帯: x in [590, 1200] (幅610, 中心895), z in [-600, 720] (長さ1320, 中心60)
  const eastLandGeom = new THREE.PlaneGeometry(610, 1320);
  const eastLand = new THREE.Mesh(eastLandGeom, landExtensionMat);
  eastLand.rotation.x = -Math.PI / 2;
  eastLand.position.set(895, 41.55, 60);
  eastLand.receiveShadow = false;
  scene.add(track(eastLand));

  // 南側一帯: x in [-700, 1200] (幅1900, 中心250), z in [720, 1200] (長さ480, 中心960)
  const southLandGeom = new THREE.PlaneGeometry(1900, 480);
  const southLand = new THREE.Mesh(southLandGeom, landExtensionMat);
  southLand.rotation.x = -Math.PI / 2;
  southLand.position.set(250, 41.55, 960);
  southLand.receiveShadow = false;
  scene.add(track(southLand));

  // --- 3. PLATEAU実データ GLB の読み込み ---
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, '') + '/';
  // 第4弾: 建物カラー版は目印49棟を除いた476棟（nohero）を初期ロード
  const bldgUrl = `${baseUrl}data/port-bldg-color-nohero-packed.glb`;
  const heroBldgUrl = `${baseUrl}data/port-bldg-hero-tex-packed.glb`;
  const roadUrl = `${baseUrl}data/port-road-packed.glb`;
  const terrainUrl = `${baseUrl}data/port-terrain-packed.glb`;
  const vegUrl = `${baseUrl}data/port-veg-packed.glb`;
  const waterSeaUrl = `${baseUrl}data/port-water-sea-packed.glb`;
  const waterRiverUrl = `${baseUrl}data/port-water-river-packed.glb`;

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  let loadedCount = 0;
  const totalCount = 6;

  const loadGLTF = (url: string): Promise<THREE.Group> => {
    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          loadedCount++;
          if (onProgress) onProgress(loadedCount, totalCount);
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

  const ready = Promise.all([
    loadGLTF(bldgUrl),
    loadGLTF(roadUrl),
    loadGLTF(terrainUrl),
    loadGLTF(vegUrl),
    loadGLTF(waterSeaUrl),
    loadGLTF(waterRiverUrl),
  ])
    .then(([bldgScene, roadScene, terrainScene, vegScene, waterSeaScene, waterRiverScene]) => {
      // 1) 建物 LOD2 (カラー版・目印49棟除外): 屋根/外壁を法線分類で塗り分け（壁 #CFCEC8／屋根 #777C7C、明度差付き）
      bldgScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            vertexColors: true, // GLBのCOLOR_0（屋根/外壁塗り分け・明度差）を使用
            roughness: 0.85,
            metalness: 0.05,
          });
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      scene.add(track(bldgScene));

      // 2) 道路 LOD3: 濃いスレート色（0x3d4b53系）、roughness 0.9、y +0.4 & polygonOffset
      roadScene.position.y += 0.4;
      roadScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0x3d4b53,
            roughness: 0.9,
            metalness: 0.1,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          });
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      scene.add(track(roadScene));

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
      scene.add(track(terrainScene));

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

      // 5) 海水面ポリゴン（海・内港）: y=41.55 にオフセット、頂点カラー #183B52、roughnessMap 適用
      waterSeaScene.position.y = 41.55;
      waterSeaScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          ensureWaterUVCoordinates(child.geometry, 0.04);
          child.material = new THREE.MeshStandardMaterial({
            vertexColors: true, // GLBのCOLOR_0 (#183B52)
            roughness: 0.35,
            metalness: 0.1,
            roughnessMap: seaRoughnessMap,
          });
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      scene.add(track(waterSeaScene));

      // 6) 川水面ポリゴン（狩野川）: y=41.62 にオフセット、頂点カラー（河口 #183B52 〜 狩野川 #527B78 灰緑）、roughnessMap 適用
      waterRiverScene.position.y = 41.62;
      waterRiverScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          ensureWaterUVCoordinates(child.geometry, 0.04);
          child.material = new THREE.MeshStandardMaterial({
            vertexColors: true, // GLBのCOLOR_0 (河口混合グラデーション〜#527B78)
            roughness: 0.4,
            metalness: 0.05,
            roughnessMap: riverRoughnessMap,
          });
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      scene.add(track(waterRiverScene));

      // --- 第4弾: 目印建物49棟 実写真テクスチャ版の遅延ロード ---
      // 初回レンダリング後にバックグラウンドで遅延ロードし、完了次第シーンに追加する
      const loadHeroTextures = () => {
        if (isDisposed) return;
        loader.load(
          heroBldgUrl,
          (gltf) => {
            if (isDisposed) {
              track(gltf.scene);
              return;
            }
            const heroScene = gltf.scene;
            heroScene.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                // 指示書: ヒーロー版のマテリアルはGLB内蔵のテクスチャと色をそのまま使う
                // （頂点カラーの生成りティントを掛けない。テクスチャ面にはCOLOR_0が無く、無テクスチャ面のCOLOR_0は源データの中立グレー）
                child.castShadow = false;
                child.receiveShadow = false;
              }
            });
            scene.add(track(heroScene));
          },
          undefined,
          (err) => {
            // 指示書: 失敗してもカラー表示のまま壊れないこと（ヒーロー49棟はカラー版から抜けているので、
            // 失敗時はその49棟が欠ける。許容するが、コンソールエラーで落とさない）
            console.warn('Hero buildings texture GLB delayed load failed (fallback to color-only scene):', err);
          }
        );
      };

      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleCallbackId = (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback(
          loadHeroTextures,
          { timeout: 1000 }
        );
      } else {
        delayedLoadTimeoutId = setTimeout(loadHeroTextures, 300);
      }
    })
    .catch((err) => {
      console.error('Error during PLATEAU real data integration:', err);
    });

  // --- 水面アニメーション更新関数 ---
  let seaOffsetX = 0;
  let seaOffsetY = 0;
  let riverOffsetY = 0;

  const updateWater = (delta: number) => {
    // 海: 極低速の微細な揺らぎ（波浪・うねり）
    seaOffsetX = (seaOffsetX + delta * 0.003) % 1;
    seaOffsetY = (seaOffsetY + delta * 0.002) % 1;
    seaRoughnessMap.offset.set(seaOffsetX, seaOffsetY);

    // 川: 下流方向（北＝−z側）へ低速でスクロール
    // ワールドENU (x, z) から v = z * scale でUV生成しているため、
    // offset.y を増加させることで波紋模様が北（-z側）へ流れる
    riverOffsetY = (riverOffsetY + delta * 0.025) % 1;
    riverRoughnessMap.offset.set(0, riverOffsetY);
  };

  const dispose = () => {
    isDisposed = true;
    if (delayedLoadTimeoutId !== null) {
      clearTimeout(delayedLoadTimeoutId);
      delayedLoadTimeoutId = null;
    }
    if (idleCallbackId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleCallbackId);
      idleCallbackId = null;
    }
    disposables.forEach((item) => {
      if (item.geometry) item.geometry.dispose();
      if (item.material) item.material.dispose();
      if (item.texture) item.texture.dispose();
    });
  };

  return { disposables, ready, updateWater, dispose };
}
