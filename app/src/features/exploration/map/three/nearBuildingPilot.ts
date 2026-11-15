import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addPhotoSurfaceDetail } from './surfaceDetail';

// Measured against the emphasized port GLB, not a survey of the real facade.
// Local X runs along the facade, +Z faces out. Details are deliberately generic.
export const NEAR_BUILDING_PILOT = {
  id: 'port-facade-pilot', chunk: 'port',
  normal: [0.9976194347048497, -0.06895986875840074],
  plane: -167.30511824320848, along: 246.49802244311156,
  baseY: 42.10097886894315, width: 11.5, height: 5.68,
} as const;

export function pilotPosition() {
  const p = NEAR_BUILDING_PILOT, [nx, nz] = p.normal;
  return new THREE.Vector3(nx * p.plane + nz * p.along, p.baseY, nz * p.plane - nx * p.along);
}

/** One near-distance facade. No external assets or per-frame geometry allocation. */
export function createNearBuildingPilot() {
  const root = new THREE.Group(); root.name = NEAR_BUILDING_PILOT.id;
  root.position.copy(pilotPosition());
  root.rotation.y = Math.atan2(...NEAR_BUILDING_PILOT.normal);
  root.userData.approximateFacade = true;
  const materials = {
    wall: new THREE.MeshStandardMaterial({ color: 0xd9d5c9, roughness: .92 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x69716e, roughness: .45, metalness: .45 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x45636e, roughness: .26, metalness: .35 }),
    recess: new THREE.MeshStandardMaterial({ color: 0x25383e, roughness: .9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: .8 }),
    shutter: new THREE.MeshStandardMaterial({ color: 0x9daba9, roughness: .65, metalness: .25 }),
  };
  materials.wall.onBeforeCompile = shader => addPhotoSurfaceDetail(shader, 'building');
  materials.wall.customProgramCacheKey = () => 'pilot-stucco-v1';
  type Slot = keyof typeof materials;
  const pieces = new Map<Slot, THREE.BufferGeometry[]>();
  function box(slot: Slot, x: number, y: number, z: number, w: number, h: number, d: number) {
    const geometry = new THREE.BoxGeometry(w, h, d); geometry.translate(x, y, z);
    const list = pieces.get(slot) ?? []; list.push(geometry); pieces.set(slot, list);
  }
  function opening(x: number, y: number, w: number, h: number) {
    box('recess', x, y, .14, w + .16, h + .16, .12);
    box('glass', x, y, .22, w, h, .04);
    for (const side of [-1, 1]) {
      box('frame', x + side * w / 2, y, .27, .065, h + .08, .1);
      box('frame', x, y + side * h / 2, .27, w + .08, .065, .1);
    }
    box('frame', x, y, .275, .045, h, .1);
    box('trim', x, y - h / 2 - .09, .28, w + .3, .12, .35);
  }
  // A thin replacement skin prevents doubled, blurred window imagery beneath
  // the illustrative openings. Its normalized UVs are ready for a facade photo.
  box('wall', 0, 2.84, .045, 11.5, 5.68, .06);
  box('trim', 0, .18, .12, 11.5, .28, .16);
  box('trim', 0, 3.03, .15, 11.5, .13, .24);
  box('trim', 0, 5.59, .2, 11.65, .18, .38);
  for (const x of [-3.65, 0, 3.65]) opening(x, 4.25, 1.95, 1.25);
  opening(-3.65, 1.85, 1.95, 1.05);
  // Terrain rises ~0.5m at the entrance and ~0.8m at the left end.
  opening(-.25, 1.67, 1.45, 1.9);
  box('frame', .3, 1.55, .36, .04, .35, .07);
  box('trim', -.25, .57, .35, 1.8, .22, .55);
  box('recess', 3.55, 1.42, .14, 3.1, 2.6, .12);
  box('shutter', 3.55, 1.42, .23, 2.96, 2.46, .05);
  for (let y = .3; y < 2.65; y += .14) box('frame', 3.55, y, .265, 2.96, .016, .018);
  box('trim', -.25, 2.72, .4, 2, .12, .75);
  for (const x of [-5.65, 5.65]) box('trim', x, 2.84, .13, .12, 5.68, .14);
  for (const [slot, parts] of pieces) {
    const geometry = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    // Wall/photo UVs use local facade coordinates, independent of mesh atlas UVs.
    if (slot === 'wall') {
      const positions = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (positions.getX(i) + 5.75) / 11.5, positions.getY(i) / 5.68);
    }
    const mesh = new THREE.Mesh(geometry, materials[slot]); mesh.name = `pilot-${slot}`;
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  let disposed = false;
  root.visible = false;
  return {
    root,
    update(viewer: THREE.Vector3, enabled = true) {
      if (disposed) return;
      // Hysteresis avoids flicker at the distance boundary. Original city stays.
      root.visible = enabled && bounds.distanceToPoint(viewer) < (root.visible ? 95 : 80);
    },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent();
      root.children.forEach(child => (child as THREE.Mesh).geometry.dispose());
      Object.values(materials).forEach(material => material.dispose());
    },
  };
}
