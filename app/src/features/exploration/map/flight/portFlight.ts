import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FreeFlightController, SEA } from './freeFlight';
import { HumanoidCharacter } from './character';

class ExpandedOctree extends Octree {
  calcBox() { super.calcBox(); this.box?.max.addScalar(0.01); return this; }
}

export function setupPortFlight(container: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls, canvas: HTMLCanvasElement, setUnderwater: (value: boolean) => void) {
  const controller = new FreeFlightController();
  const character = new HumanoidCharacter();
  character.group.visible = false;
  scene.add(character.group);
  const trees: Octree[] = [];
  let isWaterAt:(x:number,z:number)=>boolean=()=>false;
  const cells = new Set<{ center: THREE.Vector3; radius: number; geometry: THREE.BufferGeometry; waterTerrain:boolean; tree?: Octree }>();
  const colliderMaterial = new THREE.MeshBasicMaterial();
  function refreshColliders() {
    trees.length = 0;
    for (const cell of cells) {
      if(cell.waterTerrain&&isWaterAt(controller.position.x,controller.position.z))continue;
      const distance = Math.hypot(cell.center.x - controller.position.x, cell.center.z - controller.position.z);
      if (distance > cell.radius + 300) { cell.tree = undefined; continue; }
      if (!cell.tree) {
        const mesh = new THREE.Mesh(cell.geometry, colliderMaterial);
        mesh.updateWorldMatrix(true, true);
        cell.tree = new ExpandedOctree().fromGraphNode(mesh);
        (cell.tree as Octree & {waterTerrain?:boolean}).waterTerrain=cell.waterTerrain;
      }
      trees.push(cell.tree);
    }
  }
  const ui = document.createElement('div');
  ui.className = 'flight-ui';
  ui.innerHTML = `<button class="flight-toggle">飛んでみる</button><div class="flight-instructions" hidden><span class="flight-depth"></span></div><div class="flight-pad" hidden><div class="flight-knob"></div></div><div class="flight-vertical" hidden><button data-dir="1">上がる</button><button data-dir="-1">落下</button></div>`;
  container.appendChild(ui);
  const toggle = ui.querySelector<HTMLButtonElement>('.flight-toggle')!;
  const guide = ui.querySelector<HTMLElement>('.flight-instructions')!;
  const depth = ui.querySelector<HTMLElement>('.flight-depth')!;
  const pad = ui.querySelector<HTMLElement>('.flight-pad')!;
  const knob = ui.querySelector<HTMLElement>('.flight-knob')!;
  const vertical = ui.querySelector<HTMLElement>('.flight-vertical')!;
  const raycaster = new THREE.Raycaster();
  const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SEA);
  let destination: THREE.Vector3 | null = null;
  let falling = false;
  let bestDistance = Infinity;
  let stalled = 0;
  let startX = 0, startY = 0, dragged = false;

  function cancelTravel() {
    destination = null;
    falling = false;
  }

  let savedPosition = camera.position.clone();
  let lookId: number | null = null, lastX = 0, lastY = 0;
  function setMode(active: boolean, start?: THREE.Vector3) {
    cancelTravel();
    if (active) savedPosition.copy(camera.position);
    controller.activate(active);
    if (active && start) controller.position.copy(start);
    controls.enabled = !active; character.group.visible = active;
    if (!active) { camera.position.copy(savedPosition); controls.update(); setUnderwater(false); }
    guide.hidden = !active; pad.hidden = !active; vertical.hidden = !active;
    toggle.textContent = active ? 'マップに戻る' : '飛んでみる';
    controller.setStick(0, 0); controller.setVertical(0);
  }
  toggle.hidden = true; // The visible start button is owned by React.
  toggle.onclick = () => setMode(!controller.active);
  function stick(e: PointerEvent) { const rect = pad.getBoundingClientRect(); let x = (e.clientX - rect.left - rect.width / 2) / (rect.width * .38); let y = -(e.clientY - rect.top - rect.height / 2) / (rect.height * .38); const m = Math.hypot(x,y); if (m > 1) { x /= m; y /= m; } controller.setStick(x,y); knob.style.transform = `translate(${x * 38}px, ${-y * 38}px)`; }
  pad.onpointerdown = e => { e.preventDefault(); cancelTravel(); pad.setPointerCapture(e.pointerId); stick(e); };
  pad.onpointermove = e => { if (pad.hasPointerCapture(e.pointerId)) stick(e); };
  const stopStick = () => { controller.setStick(0,0); knob.style.transform = ''; };
  pad.onpointerup = stopStick; pad.onpointercancel = stopStick; pad.onlostpointercapture = stopStick;
  const rise = vertical.querySelector<HTMLButtonElement>('[data-dir="1"]')!;
  const drop = vertical.querySelector<HTMLButtonElement>('[data-dir="-1"]')!;
  rise.onpointerdown = e => {
    e.preventDefault();
    cancelTravel();
    rise.setPointerCapture(e.pointerId);
    controller.setVertical(1);
  };
  rise.onpointerup = rise.onpointercancel = rise.onlostpointercapture = () => controller.setVertical(0);
  drop.onpointerdown=e=>{if(controller.state!=='water')return;cancelTravel();drop.setPointerCapture(e.pointerId);controller.setVertical(-1);};
  drop.onpointerup=drop.onpointercancel=drop.onlostpointercapture=()=>controller.setVertical(0);
  drop.onclick = () => {
    if(controller.state==='water')return;
    const start = !falling && controller.state === 'air';
    cancelTravel();
    falling = start;
  };

  function lookDown(e: PointerEvent) {
    if (!controller.active || lookId !== null || e.button !== 0) return;
    lookId = e.pointerId;
    startX = lastX = e.clientX;
    startY = lastY = e.clientY;
    dragged = false;
    canvas.setPointerCapture(e.pointerId);
  }
  function lookMove(e: PointerEvent) {
    if (e.pointerId !== lookId) return;
    if (!dragged && Math.hypot(e.clientX - startX, e.clientY - startY) < 8) return;
    dragged = true;
    controller.addLookDelta(-(e.clientX - lastX) * .005, -(e.clientY - lastY) * .005);
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function lookUp(e: PointerEvent) {
    if (e.pointerId !== lookId) return;
    lookId = null;
    if (e.type !== 'pointerup' || dragged || !controller.active) return;
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(
      (e.clientX - rect.left) / rect.width * 2 - 1,
      1 - (e.clientY - rect.top) / rect.height * 2
    ), camera);
    const ray = raycaster.ray;
    let point = ray.direction.y < 0 ? ray.intersectPlane(seaPlane, new THREE.Vector3()) : null;
    let distance = point ? point.distanceTo(ray.origin) : Infinity;
    // Taps may target buildings farther away than the active physics cells.
    for (const cell of cells) {
      if (!ray.intersectsBox(cell.geometry.boundingBox!)) continue;
      if (!cell.tree) {
        const mesh = new THREE.Mesh(cell.geometry, colliderMaterial);
        mesh.updateWorldMatrix(true, true);
        cell.tree = new ExpandedOctree().fromGraphNode(mesh);
        (cell.tree as Octree & {waterTerrain?:boolean}).waterTerrain=cell.waterTerrain;
      }
      const hit = cell.tree.rayIntersect(ray);
      if (hit && hit.distance < distance) {
        point = hit.position;
        distance = hit.distance;
      }
    }
    if (!point || distance > 1000) return;
    cancelTravel();
    destination = point.clone().add(new THREE.Vector3(0, controller.state==='ground'?.001:3, 0));
    stalled = 0;
    bestDistance = Infinity;
  }
  canvas.addEventListener('pointerdown', lookDown); canvas.addEventListener('pointermove', lookMove); canvas.addEventListener('pointerup', lookUp); canvas.addEventListener('pointercancel', lookUp);
  return {
    setMode,
    addGeometry(group: THREE.Group) {
      group.updateWorldMatrix(true, true);
      const buckets = new Map<string, number[]>();
      const point = new THREE.Vector3();
      group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const position = object.geometry.getAttribute('position'), index = object.geometry.index;
        for (let i = 0; i < (index?.count ?? position.count); i += 3) {
          const vertices: number[] = [];
          for (let j = 0; j < 3; j++) {
            point.fromBufferAttribute(position, index ? index.getX(i + j) : i + j).applyMatrix4(object.matrixWorld);
            vertices.push(point.x, point.y, point.z);
          }
          const key = `${Math.floor((vertices[0]+vertices[3]+vertices[6])/750)},${Math.floor((vertices[2]+vertices[5]+vertices[8])/750)}`;
          let values = buckets.get(key);
          if (!values) { values = []; buckets.set(key, values); }
          values.push(...vertices);
        }
      });
      const added = [...buckets.values()].map(values => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox!;
        const center = bounds.getCenter(new THREE.Vector3());
        const radius = Math.hypot(bounds.max.x-center.x, bounds.max.z-center.z);
        const cell = { center, radius, geometry,waterTerrain:!!group.userData.waterTerrain };
        cells.add(cell); return cell;
      });
      return () => { trees.length = 0; for (const cell of added) { cells.delete(cell); cell.geometry.dispose(); } };
    },
    update(dt: number, time: number) { if (!controller.active) return; refreshColliders(); controller.update(dt, trees, character, camera, time, destination, falling);
      if (falling && controller.state !== 'air') falling = false;
      drop.textContent = controller.state==='water'?'潜る':falling ? '落下停止' : '落下';
      if (destination) {
        const gap = controller.state==='ground' ? Math.hypot(controller.position.x-destination.x,controller.position.z-destination.z) : controller.position.distanceTo(destination);
        if (gap < bestDistance - .2) {
          bestDistance = gap;
          stalled = 0;
        } else stalled += dt;
        if (gap < .8 || stalled > 1.5) {
          destination = null;
          controller.velocity.set(0, 0, 0);
        }
      }
       const data=controller.getHookData(); rise.textContent=data.state==='ground'?'飛び立つ':'上がる';drop.disabled=data.state==='ground'; depth.textContent = data.state==='ground'?'徒歩':data.state === 'water' ? `水深 ${data.depth.toFixed(1)}m` : `高度 ${data.altitude.toFixed(1)}m`; setUnderwater(data.state === 'water'); },
    getPosition() { return controller.position; },
    getStatus() { return controller.getHookData(); },
    setWaterQuery(query:(x:number,z:number)=>boolean){isWaterAt=query;controller.setWaterQuery(query);},
    isActive() { return controller.active; },
    dispose() { canvas.removeEventListener('pointerdown',lookDown); canvas.removeEventListener('pointermove',lookMove); canvas.removeEventListener('pointerup',lookUp); canvas.removeEventListener('pointercancel',lookUp); ui.remove(); cells.forEach(cell => cell.geometry.dispose()); cells.clear(); trees.length = 0; colliderMaterial.dispose(); scene.remove(character.group); character.group.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach(m => m.dispose()); } }); }
  };
}
