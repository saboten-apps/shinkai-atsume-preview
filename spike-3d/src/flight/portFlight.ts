import * as THREE from 'three';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FreeFlightController } from './freeFlight';
import { HumanoidCharacter } from './character';

class ExpandedOctree extends Octree {
  calcBox() { super.calcBox(); this.box?.max.addScalar(0.01); return this; }
}

export function setupPortFlight(container: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls, canvas: HTMLCanvasElement) {
  const controller = new FreeFlightController();
  const character = new HumanoidCharacter();
  character.group.visible = false;
  scene.add(character.group);
  const trees: Octree[] = [];
  const ui = document.createElement('div');
  ui.className = 'flight-ui';
  ui.innerHTML = `<button class="flight-toggle">飛んでみる</button><div class="flight-instructions" hidden>左スティックで移動 ・ 画面右をドラッグで見回す <span class="flight-depth"></span></div><div class="flight-pad" hidden><div class="flight-knob"></div></div><div class="flight-vertical" hidden><button data-dir="1">上がる</button><button data-dir="-1">下がる</button></div>`;
  container.appendChild(ui);
  const toggle = ui.querySelector<HTMLButtonElement>('.flight-toggle')!;
  const guide = ui.querySelector<HTMLElement>('.flight-instructions')!;
  const depth = ui.querySelector<HTMLElement>('.flight-depth')!;
  const pad = ui.querySelector<HTMLElement>('.flight-pad')!;
  const knob = ui.querySelector<HTMLElement>('.flight-knob')!;
  const vertical = ui.querySelector<HTMLElement>('.flight-vertical')!;
  let savedPosition = camera.position.clone();
  let lookId: number | null = null, lastX = 0, lastY = 0;
  function setMode(active: boolean) {
    if (active) savedPosition.copy(camera.position);
    controller.activate(active); controls.enabled = !active; character.group.visible = active;
    if (!active) { camera.position.copy(savedPosition); controls.update(); scene.fog = new THREE.FogExp2(0x0b1c2c, .00035); scene.background = new THREE.Color(0x0b1c2c); }
    guide.hidden = !active; pad.hidden = !active; vertical.hidden = !active;
    toggle.textContent = active ? 'マップに戻る' : '飛んでみる';
    controller.setStick(0, 0); controller.setVertical(0);
  }
  toggle.hidden = true; // The visible start button is owned by React.
  toggle.onclick = () => setMode(!controller.active);
  function stick(e: PointerEvent) { const rect = pad.getBoundingClientRect(); let x = (e.clientX - rect.left - rect.width / 2) / (rect.width * .38); let y = -(e.clientY - rect.top - rect.height / 2) / (rect.height * .38); const m = Math.hypot(x,y); if (m > 1) { x /= m; y /= m; } controller.setStick(x,y); knob.style.transform = `translate(${x * 38}px, ${-y * 38}px)`; }
  pad.onpointerdown = e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); stick(e); };
  pad.onpointermove = e => { if (pad.hasPointerCapture(e.pointerId)) stick(e); };
  const stopStick = () => { controller.setStick(0,0); knob.style.transform = ''; };
  pad.onpointerup = stopStick; pad.onpointercancel = stopStick; pad.onlostpointercapture = stopStick;
  vertical.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    button.onpointerdown = e => { e.preventDefault(); button.setPointerCapture(e.pointerId); controller.setVertical(Number(button.dataset.dir)); };
    button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => controller.setVertical(0);
  });
  function lookDown(e: PointerEvent) { if (!controller.active || lookId !== null) return; lookId = e.pointerId; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); }
  function lookMove(e: PointerEvent) { if (e.pointerId !== lookId) return; controller.addLookDelta(-(e.clientX-lastX)*.005, -(e.clientY-lastY)*.005); lastX=e.clientX; lastY=e.clientY; }
  function lookUp(e: PointerEvent) { if (e.pointerId === lookId) lookId = null; }
  canvas.addEventListener('pointerdown', lookDown); canvas.addEventListener('pointermove', lookMove); canvas.addEventListener('pointerup', lookUp); canvas.addEventListener('pointercancel', lookUp);
  return {
    setMode,
    addGeometry(group: THREE.Group) { group.updateWorldMatrix(true, true); const tree = new ExpandedOctree(); tree.fromGraphNode(group); trees.push(tree); },
    update(dt: number, time: number) { if (!controller.active) return; controller.update(dt, trees, character, camera, time); const data=controller.getHookData(); depth.textContent = data.state === 'water' ? `水深 ${data.depth.toFixed(1)}m` : `高度 ${data.altitude.toFixed(1)}m`; scene.fog = new THREE.FogExp2(data.state === 'water' ? 0x27546b : 0x0b1c2c, data.state === 'water' ? .012 : .00035); scene.background = new THREE.Color(data.state === 'water' ? 0x27546b : 0x0b1c2c); },
    isActive() { return controller.active; },
    dispose() { canvas.removeEventListener('pointerdown',lookDown); canvas.removeEventListener('pointermove',lookMove); canvas.removeEventListener('pointerup',lookUp); canvas.removeEventListener('pointercancel',lookUp); ui.remove(); scene.remove(character.group); character.group.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach(m => m.dispose()); } }); }
  };
}
