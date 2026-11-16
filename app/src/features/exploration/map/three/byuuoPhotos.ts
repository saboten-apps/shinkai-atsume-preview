import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = readonly [number, number];
export type PhotoQuad = readonly [Point, Point, Point, Point]; // TL, TR, BR, BL (0..1 normalized)

/** Square-to-quad homography projection for perspective correction */
export function photoProjection(q: PhotoQuad) {
  const [a, b, c, d] = q;
  const dx1 = b[0] - c[0], dx2 = d[0] - c[0], dx3 = a[0] - b[0] + c[0] - d[0];
  const dy1 = b[1] - c[1], dy2 = d[1] - c[1], dy3 = a[1] - b[1] + c[1] - d[1];
  const determinant = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(determinant) < 1e-10) throw new Error('Degenerate photo projection');
  const g = (dx3 * dy2 - dx2 * dy3) / determinant;
  const h = (dx1 * dy3 - dx3 * dy1) / determinant;
  return (u: number, v: number): Point => {
    const denominator = g * u + h * v + 1;
    return [
      ((b[0] - a[0] + g * b[0]) * u + (d[0] - a[0] + h * d[0]) * v + a[0]) / denominator,
      ((b[1] - a[1] + g * b[1]) * u + (d[1] - a[1] + h * d[1]) * v + a[1]) / denominator
    ];
  };
}

// Normalized quad definitions based on measured pixel coordinates
// 1. Gate: byuuo-closeup.jpg (1725 x 1080)
const GATE_QUAD: PhotoQuad = [
  [518 / 1725, 420 / 1080],
  [1262 / 1725, 456 / 1080],
  [1262 / 1725, 616 / 1080],
  [518 / 1725, 600 / 1080]
];

// 2. Concrete wall: byuuo-closeup.jpg (1725 x 1080)
const CONCRETE_QUAD: PhotoQuad = [
  [340 / 1725, 520 / 1080],
  [440 / 1725, 520 / 1080],
  [440 / 1725, 720 / 1080],
  [340 / 1725, 720 / 1080]
];

// 3. Walkway glass: byuuo-front.webp (660 x 440)
const WALKWAY_QUAD: PhotoQuad = [
  [236 / 660, 114 / 440],
  [424 / 660, 114 / 440],
  [424 / 660, 138 / 440],
  [236 / 660, 138 / 440]
];

// 4. Observatory glass: byuuo-front.webp (660 x 440)
const OBSERVATORY_QUAD: PhotoQuad = [
  [440 / 660, 106 / 440],
  [546 / 660, 106 / 440],
  [546 / 660, 134 / 440],
  [440 / 660, 134 / 440]
];

// 5. Pediment arch: byuuo-front.webp (660 x 440)
const PEDIMENT_QUAD: PhotoQuad = [
  [446 / 660, 64 / 440],
  [534 / 660, 64 / 440],
  [534 / 660, 104 / 440],
  [446 / 660, 104 / 440]
];

const SOURCES = [
  // Asset 0: Watergate Rivets & Steel Plate (byuuo-closeup.jpg)
  { name: 'byuuo-closeup.jpg', crop: [500 / 1725, 410 / 1080, 1280 / 1725, 625 / 1080], size: [1024, 512], origW: 1725, origH: 1080 },
  // Asset 1: Concrete column (byuuo-closeup.jpg)
  { name: 'byuuo-closeup.jpg', crop: [330 / 1725, 510 / 1080, 450 / 1725, 730 / 1080], size: [256, 512], origW: 1725, origH: 1080 },
  // Asset 2: Walkway truss & glass (byuuo-front.webp)
  { name: 'byuuo-front.webp', crop: [230 / 660, 110 / 440, 430 / 660, 142 / 440], size: [512, 128], origW: 660, origH: 440 },
  // Asset 3: Observatory glass (byuuo-front.webp)
  { name: 'byuuo-front.webp', crop: [435 / 660, 102 / 440, 550 / 660, 138 / 440], size: [512, 256], origW: 660, origH: 440 },
  // Asset 4: Pediment & arch window (byuuo-front.webp)
  { name: 'byuuo-front.webp', crop: [440 / 660, 60 / 440, 540 / 660, 108 / 440], size: [256, 256], origW: 660, origH: 440 }
] as const;

export interface ByuuoPhotosController {
  update: (viewer: THREE.Vector3) => void;
  settled: () => Promise<void>;
  dispose: () => void;
}

export function createByuuoPhotos(root: THREE.Group): ByuuoPhotosController {
  const photos = new THREE.Group();
  photos.name = 'byuuo-photographs';
  root.add(photos);
  photos.visible = false;

  let disposed = false;
  let active = false;
  let generation = 0;
  let retryAt = 0;
  let pending: Promise<void> = Promise.resolve();
  let abort: AbortController | undefined;

  const materials: THREE.MeshStandardMaterial[] = [];
  const textures: THREE.Texture[] = [];
  const bitmaps: ImageBitmap[] = [];

  function clear() {
    photos.children.forEach(o => {
      (o as THREE.Mesh).geometry?.dispose();
    });
    photos.clear();
    materials.splice(0).forEach(m => m.dispose());
    textures.splice(0).forEach(t => t.dispose());
    bitmaps.splice(0).forEach(b => b.close());
    root.userData.photoTextures = 0;
  }

  function release() {
    generation++;
    abort?.abort();
    active = false;
    photos.visible = false;
    clear();
    root.userData.photoState = 'idle';
  }

  async function load(version: number) {
    const controller = new AbortController();
    abort = controller;
    const signal = controller.signal;
    const timeout = setTimeout(() => controller.abort(), 30000);
    root.userData.photoState = 'loading';

    try {
      const blobs = new Map<string, Blob>();
      for (const src of SOURCES) {
        let blob = blobs.get(src.name);
        if (!blob) {
          const baseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/';
          const url = `${baseUrl}environment/byuuo/${src.name}`;
          const res = await fetch(url, { signal });
          if (!res.ok) throw new Error(`Byuuo photo fetch failed: HTTP ${res.status}`);
          blob = await res.blob();
          blobs.set(src.name, blob);
        }
        if (disposed || version !== generation) return;

        const [left, top, right, bottom] = src.crop;
        const cropX = Math.floor(left * src.origW);
        const cropY = Math.floor(top * src.origH);
        const cropW = Math.ceil((right - left) * src.origW);
        const cropH = Math.ceil((bottom - top) * src.origH);

        const bitmap = await createImageBitmap(blob, cropX, cropY, cropW, cropH, {
          resizeWidth: src.size[0],
          resizeHeight: src.size[1],
          resizeQuality: 'high',
          imageOrientation: 'flipY'
        });

        if (disposed || version !== generation) {
          bitmap.close();
          return;
        }

        const texture = new THREE.Texture(bitmap);
        texture.name = `byuuo-${src.name}`;
        texture.flipY = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        textures.push(texture);
        bitmaps.push(bitmap);
      }

      if (disposed || version !== generation) return;

      const batches = new Map<number, THREE.BufferGeometry[]>();

      function addPhotoPanel(
        assetIdx: number,
        quad: PhotoQuad,
        w: number,
        h: number,
        pos: THREE.Vector3,
        rot: THREE.Euler
      ) {
        const geo = new THREE.PlaneGeometry(w, h, 2, 2);
        const uv = geo.getAttribute('uv');
        const proj = photoProjection(quad);
        const [left, top, right, bottom] = SOURCES[assetIdx].crop;

        for (let i = 0; i < uv.count; i++) {
          const [px, py] = proj(uv.getX(i), 1 - uv.getY(i));
          uv.setXY(i, (px - left) / (right - left), 1 - (py - top) / (bottom - top));
        }

        geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rot));
        geo.translate(pos.x, pos.y, pos.z);
        const list = batches.get(assetIdx) ?? [];
        list.push(geo);
        batches.set(assetIdx, list);
      }

      // 1. Watergate Front Panel (Harbor side: local z = -1.28)
      // Water gate is 39m wide, 10.5m high, centered at x=0, y=31.25, z=-1.28
      addPhotoPanel(
        0,
        GATE_QUAD,
        39,
        10.5,
        new THREE.Vector3(0, 31.25, -1.28),
        new THREE.Euler(0, Math.PI, 0)
      );

      // Watergate Sea side panel (local z = +1.28)
      addPhotoPanel(
        0,
        GATE_QUAD,
        39,
        10.5,
        new THREE.Vector3(0, 31.25, 1.28),
        new THREE.Euler(0, 0, 0)
      );

      // 2. Concrete Column Panels (Facing harbor: local z = -4.8)
      // East tower column (x=24.5, y=21.75, z=-4.8)
      addPhotoPanel(
        1,
        CONCRETE_QUAD,
        6.5,
        43.5,
        new THREE.Vector3(24.5, 21.75, -4.8),
        new THREE.Euler(0, Math.PI, 0)
      );
      // West tower column (x=-24.5, y=21.75, z=-4.8)
      addPhotoPanel(
        1,
        CONCRETE_QUAD,
        6.5,
        43.5,
        new THREE.Vector3(-24.5, 21.75, -4.8),
        new THREE.Euler(0, Math.PI, 0)
      );

      // 3. Walkway Glass (Harbor side: z = -1.82, x = 0, y = 45.25)
      addPhotoPanel(
        2,
        WALKWAY_QUAD,
        39,
        3.5,
        new THREE.Vector3(0, 45.25, -1.82),
        new THREE.Euler(0, Math.PI, 0)
      );
      // Walkway Glass (Sea side: z = +1.82)
      addPhotoPanel(
        2,
        WALKWAY_QUAD,
        39,
        3.5,
        new THREE.Vector3(0, 45.25, 1.82),
        new THREE.Euler(0, 0, 0)
      );

      // 4. Observatory Glass (Harbor side: z = -6.52)
      // East observatory (x=24.5, y=45.5)
      addPhotoPanel(
        3,
        OBSERVATORY_QUAD,
        10,
        3.8,
        new THREE.Vector3(24.5, 45.5, -6.52),
        new THREE.Euler(0, Math.PI, 0)
      );
      // West observatory (x=-24.5, y=45.5)
      addPhotoPanel(
        3,
        OBSERVATORY_QUAD,
        10,
        3.8,
        new THREE.Vector3(-24.5, 45.5, -6.52),
        new THREE.Euler(0, Math.PI, 0)
      );

      // 5. Pediments (Harbor side: z = -5.02, y = 49.5)
      // East pediment
      addPhotoPanel(
        4,
        PEDIMENT_QUAD,
        7,
        4.0,
        new THREE.Vector3(24.5, 49.5, -5.02),
        new THREE.Euler(0, Math.PI, 0)
      );
      // West pediment
      addPhotoPanel(
        4,
        PEDIMENT_QUAD,
        7,
        4.0,
        new THREE.Vector3(-24.5, 49.5, -5.02),
        new THREE.Euler(0, Math.PI, 0)
      );

      // Merge and attach meshes
      for (const [assetIdx, parts] of batches) {
        const merged = mergeGeometries(parts)!;
        parts.forEach(g => g.dispose());
        const mat = new THREE.MeshStandardMaterial({
          map: textures[assetIdx],
          roughness: assetIdx === 0 ? 0.6 : 0.85,
          metalness: assetIdx === 0 ? 0.3 : 0.1
        });
        materials.push(mat);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.name = `byuuo-photo-mesh-${assetIdx}`;
        photos.add(mesh);
      }

      root.userData.photoTextures = textures.length;
      root.userData.photoState = 'ready';
      photos.visible = active;
    } catch (err) {
      if (disposed || version !== generation) return;
      clear();
      root.userData.photoState = 'failed';
      retryAt = performance.now() + 60000;
      console.warn('Byuuo photographs unavailable:', err);
    } finally {
      clearTimeout(timeout);
    }
  }

  const center = new THREE.Vector3();

  return {
    update(viewer: THREE.Vector3) {
      if (disposed || typeof window === 'undefined') return;
      root.getWorldPosition(center);
      const dist = Math.hypot(viewer.x - center.x, viewer.z - center.z);
      // City hall style hysteresis LOD: 250m to load, 290m to release
      const near = dist < (active ? 290 : 250);
      if (!near) {
        if (active) release();
        return;
      }
      active = true;
      if (!textures.length && root.userData.photoState !== 'loading' && performance.now() >= retryAt) {
        pending = load(++generation);
      }
      photos.visible = root.userData.photoState === 'ready';
    },
    settled: () => pending,
    dispose: () => {
      disposed = true;
      release();
    }
  };
}
