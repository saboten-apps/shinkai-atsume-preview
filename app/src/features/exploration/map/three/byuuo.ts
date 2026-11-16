import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createByuuoPhotos } from './byuuoPhotos';

/**
 * Numazu Port Large Floodgate "Byuuo" (沼津港大型展望水門 びゅうお)
 *
 * Coordinates derived from GSI structures and PLATEAU 2023 LOD3 bldg_7380cb7d:
 * center: x: -276.05, y: 41.5, z: 22.335
 * gate vector: a(-283.63, -5.55) -> b(-268.47, 50.22)
 * rotation: -1.3054 rad (-74.79 deg)
 *
 * Local coordinates:
 * x: Gate longitudinal axis (-x: West tower, +x: East tower, span ~58m)
 * y: Height above water/ground (0: ground/water at ~41.5m, top of spire at ~58.5m => world y=100.0)
 * z: Waterway channel axis (-z: Harbor side, +z: Sea side)
 */
export const BYUUO = {
  chunk: 'port',
  originalGmlId: 'bldg_7380cb7d-8b33-48d5-b9d1-6324ae3d6526',
  x: -276.05,
  y: 41.5,
  z: 22.335,
  rotation: -1.3054
};

export function byuuoPoint(x: number, y: number, z: number): THREE.Vector3 {
  const c = Math.cos(BYUUO.rotation);
  const s = Math.sin(BYUUO.rotation);
  return new THREE.Vector3(
    BYUUO.x + c * x + s * z,
    BYUUO.y + y,
    BYUUO.z - s * x + c * z
  );
}

export interface ByuuoModel {
  root: THREE.Group;
  collider: THREE.Group;
  update: (viewer: THREE.Vector3) => void;
  photoReady: () => Promise<void>;
  dispose: () => void;
}

export function createByuuo(): ByuuoModel {
  const root = new THREE.Group();
  root.name = 'numazu-byuuo';
  root.position.set(BYUUO.x, BYUUO.y, BYUUO.z);
  root.rotation.y = BYUUO.rotation;
  root.userData.photoReferenceModel = true;

  const detailGroup = new THREE.Group();
  detailGroup.name = 'byuuo-near-details';
  root.add(detailGroup);

  const collider = new THREE.Group();
  collider.name = 'byuuo-collision';
  collider.position.copy(root.position);
  collider.rotation.copy(root.rotation);

  const materials = {
    concrete: new THREE.MeshStandardMaterial({ color: 0xb8b9b4, roughness: 0.92, metalness: 0.05 }),
    concreteDark: new THREE.MeshStandardMaterial({ color: 0x8a8c88, roughness: 0.95, metalness: 0.05 }),
    gateMetal: new THREE.MeshStandardMaterial({ color: 0x8295a3, roughness: 0.65, metalness: 0.35 }),
    gateDark: new THREE.MeshStandardMaterial({ color: 0x5a6a75, roughness: 0.7, metalness: 0.4 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x3d5463, roughness: 0.25, metalness: 0.4 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x4f595e, roughness: 0.5, metalness: 0.5 }),
    whiteWall: new THREE.MeshStandardMaterial({ color: 0xe6e7e4, roughness: 0.85, metalness: 0.05 }),
    roof: new THREE.MeshStandardMaterial({ color: 0x525c61, roughness: 0.9, metalness: 0.1 }),
    spireGlass: new THREE.MeshStandardMaterial({ color: 0x557385, roughness: 0.2, metalness: 0.5 })
  };

  type Slot = keyof typeof materials;
  const batches = new Map<string, { slot: Slot; near: boolean; parts: THREE.BufferGeometry[] }>();

  function box(
    slot: Slot,
    x: number, y: number, z: number,
    w: number, h: number, d: number,
    near = false, solid = false
  ) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const key = `${slot}-${near}`;
    let b = batches.get(key);
    if (!b) {
      b = { slot, near, parts: [] };
      batches.set(key, b);
    }
    b.parts.push(g);

    if (solid) {
      const colGeo = new THREE.BoxGeometry(w, h, d);
      colGeo.translate(x, y, z);
      const colMesh = new THREE.Mesh(colGeo);
      collider.add(colMesh);
    }
  }

  // 1. Foundation piers (Piers under each tower)
  // East Tower Pier (lx = +24.5)
  box('concreteDark', 24.5, 2.0, 0, 8.5, 4.0, 11.5, false, true);
  // West Tower Pier (lx = -24.5)
  box('concreteDark', -24.5, 2.0, 0, 8.5, 4.0, 11.5, false, true);

  // 2. Main concrete tower shafts (lx = ±24.5, height = 43.5m)
  for (const sign of [1, -1]) {
    const lx = sign * 24.5;
    // Main column shaft
    box('concrete', lx, 23.75, 0, 6.5, 39.5, 9.5, false, true);
    // Vertical gate guide rail recess / column on inner wall
    box('concreteDark', sign * 20.25, 23.75, 0, 1.2, 39.5, 3.2, false, true);

    // Elevator core on sea-facing side (z = +4.5)
    box('whiteWall', lx, 23.75, 4.75, 4.5, 41.5, 2.8, false, true);

    // Cantilever bracket supporting observatory deck floor (y: 39.5 to 43.5)
    box('concrete', lx, 41.5, 0, 8.5, 4.0, 11.5);
    box('concrete', lx, 42.5, 0, 9.5, 2.0, 12.5);

    // Observatory deck enclosed structure (y: 43.5 to 47.3, width: 10m, depth: 13m)
    box('concrete', lx, 43.65, 0, 10.2, 0.3, 13.2, false, true); // Floor
    box('glass', lx, 45.4, 0, 9.8, 3.2, 12.8, false, true);      // Glass band
    box('roof', lx, 47.15, 0, 10.2, 0.4, 13.2, false, true);      // Ceiling / roof slab

    // Observatory horizontal window mullion bands
    box('frame', lx, 45.4, 6.45, 9.8, 0.15, 0.1, true);
    box('frame', lx, 45.4, -6.45, 9.8, 0.15, 0.1, true);
    box('frame', sign * 29.55, 45.4, 0, 0.1, 0.15, 12.8, true);

    // Rooftop penthouse structure (y: 47.3 to 51.5, width: 7m, depth: 10m)
    box('whiteWall', lx, 49.4, 0, 7.2, 4.1, 10.2, false, true);
    box('roof', lx, 51.6, 0, 7.6, 0.4, 10.6, false, true); // Eaves
    // Pediment accent front and back
    box('roof', lx, 51.0, -5.15, 6.8, 1.2, 0.3, true);
    box('roof', lx, 51.0, 5.15, 6.8, 1.2, 0.3, true);
    // Arch window frames on penthouse
    box('frame', lx, 49.5, -5.12, 2.4, 1.8, 0.1, true);
    box('glass', lx, 49.5, -5.11, 2.2, 1.6, 0.05, true);

    // Glass Spire Pyramid on rooftop (y: 51.8 to 56.8)
    // Pyramid geometry
    const spireGeo = new THREE.ConeGeometry(2.4, 5.0, 4);
    spireGeo.rotateY(Math.PI / 4);
    spireGeo.translate(lx, 54.3, 0);
    let spireBatch = batches.get('spireGlass-false');
    if (!spireBatch) {
      spireBatch = { slot: 'spireGlass', near: false, parts: [] };
      batches.set('spireGlass-false', spireBatch);
    }
    spireBatch.parts.push(spireGeo);

    // Lightning rod atop spire (y: 56.8 to 58.8, world y ≈ 100.3)
    box('frame', lx, 57.8, 0, 0.08, 2.0, 0.08, true);

    // Exterior emergency stairs (5 tiers on outer tower wall)
    const stairX = sign * 28.5;
    for (let tier = 0; tier < 5; tier++) {
      const ty = 7.0 + tier * 7.5;
      // Landing platform
      box('frame', stairX, ty, 0, 2.2, 0.15, 4.0, true, true);
      // Railings on platform
      box('frame', stairX, ty + 0.6, 1.95, 2.2, 0.08, 0.08, true);
      box('frame', stairX, ty + 0.6, -1.95, 2.2, 0.08, 0.08, true);
      box('frame', sign * 29.55, ty + 0.6, 0, 0.08, 0.08, 3.9, true);

      // Diagonal stair flight
      const stairGeo = new THREE.BoxGeometry(1.4, 0.15, 4.2);
      stairGeo.rotateX(tier % 2 === 0 ? 0.38 : -0.38);
      stairGeo.translate(stairX, ty + 3.75, 0);
      let frameBatch = batches.get('frame-true');
      if (!frameBatch) {
        frameBatch = { slot: 'frame', near: true, parts: [] };
        batches.set('frame-true', frameBatch);
      }
      frameBatch.parts.push(stairGeo);
    }
  }

  // 3. Central Water Gate (巨大水門扉)
  // Width: 39m, Height: 10.5m, Thickness: 2.5m
  // Raised position: clearance under gate is 26m (fully passable by boats and flight!)
  box('gateMetal', 0, 31.25, 0, 39.0, 10.5, 2.5, false, true);
  // Upper rivet/bolt beam plate
  box('gateDark', 0, 35.8, 0, 39.2, 1.2, 2.65, true);
  // Lower rivet beam plate
  box('gateDark', 0, 26.7, 0, 39.2, 1.2, 2.65, true);
  // Center vertical stiffener rib
  box('gateDark', 0, 31.25, 0, 0.8, 10.5, 2.65, true);
  // Top safety railing atop gate (y: 36.5 to 37.5)
  box('frame', 0, 37.0, -1.15, 38.8, 0.08, 0.08, true);
  box('frame', 0, 37.0, 1.15, 38.8, 0.08, 0.08, true);

  // 4. Upper Observatory Walkway (中央連絡通路・渡り廊下)
  // Connecting east and west observatories (x: -19.5 to +19.5, width: 39m)
  // Floor (y: 43.5, clearance ~43m)
  box('concrete', 0, 43.45, 0, 39.0, 0.5, 3.6, false, true);
  // Roof slab
  box('roof', 0, 46.95, 0, 39.0, 0.4, 3.6, false, true);
  // Enclosed glass walls (both harbor and sea side)
  box('glass', 0, 45.2, 0, 38.8, 3.1, 3.4, false, true);
  // Lower horizontal support truss beam under walkway
  box('frame', 0, 42.4, 0, 39.0, 1.4, 2.8, false, true);

  // Walkway window vertical mullions
  for (let mx = -18; mx <= 18; mx += 3.0) {
    box('frame', mx, 45.2, -1.75, 0.12, 3.0, 0.1, true);
    box('frame', mx, 45.2, 1.75, 0.12, 3.0, 0.1, true);
  }

  // 5. Entrance structures at base
  // East Tower Entrance Hall (Reception / Elevator lobby, lx ≈ 24.5, harbor side z: -6.5 to -14.5)
  box('whiteWall', 24.5, 2.5, -9.5, 9.0, 4.5, 6.5, false, true);
  box('roof', 24.5, 4.9, -9.5, 9.4, 0.3, 6.9, false, true);
  box('glass', 24.5, 2.2, -12.8, 6.0, 3.0, 0.2, true);

  // West Tower Slope / Entrance connection (lx ≈ -24.5, sea side z: 4.5 to 11.5)
  box('concrete', -24.5, 2.2, 8.5, 8.0, 4.0, 5.5, false, true);
  box('roof', -24.5, 4.4, 8.5, 8.4, 0.3, 5.9, false, true);

  // Assemble meshes by batching
  const coarseGroup = new THREE.Group();
  coarseGroup.name = 'byuuo-coarse-mesh';
  root.add(coarseGroup);

  for (const [key, batch] of batches) {
    const merged = mergeGeometries(batch.parts)!;
    batch.parts.forEach(g => g.dispose());
    const mat = materials[batch.slot];
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `byuuo-${key}`;
    if (batch.near) {
      detailGroup.add(mesh);
    } else {
      coarseGroup.add(mesh);
    }
  }

  // Photo controller integration
  const photos = createByuuoPhotos(root);

  const centerVec = new THREE.Vector3();

  return {
    root,
    collider,
    update(viewer: THREE.Vector3) {
      root.getWorldPosition(centerVec);
      const dist = Math.hypot(viewer.x - centerVec.x, viewer.z - centerVec.z);
      // Hysteresis detail LOD: near details visible within 250m, hidden beyond 290m
      detailGroup.visible = dist < 290;
      photos.update(viewer);
    },
    photoReady: () => photos.settled(),
    dispose: () => {
      photos.dispose();
      Object.values(materials).forEach(m => m.dispose());
      root.traverse(o => {
        if (o instanceof THREE.Mesh) o.geometry?.dispose();
      });
      collider.traverse(o => {
        if (o instanceof THREE.Mesh) o.geometry?.dispose();
      });
    }
  };
}
