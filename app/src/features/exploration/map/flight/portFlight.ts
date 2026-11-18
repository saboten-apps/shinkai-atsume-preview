import * as THREE from 'three';
import {boatFitsWater,cruisePath} from './boat';
import {loadAvatar,type AvatarId,type PhotoPose,type VehicleId} from './avatarOptions';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FreeFlightController, SEA } from './freeFlight';
import { HumanoidCharacter } from './character';

class ExpandedOctree extends Octree {
  calcBox() { super.calcBox(); this.box?.max.addScalar(0.01); return this; }
}

export function setupPortFlight(container: HTMLElement, scene: THREE.Scene, camera: THREE.PerspectiveCamera, controls: OrbitControls, canvas: HTMLCanvasElement, setUnderwater: (value: boolean) => void, onVehicleChange:(vehicle:VehicleId)=>void=()=>{}) {
  const controller = new FreeFlightController();
  const character = new HumanoidCharacter();
  let avatarId=loadAvatar(),photoPose:PhotoPose|null=null,lastVehicle:VehicleId='none';character.setAvatar(avatarId);
  character.group.visible = false;
  scene.add(character.group);
  const trees: Octree[] = [];
  let isWaterAt:(x:number,z:number)=>boolean=()=>false;
  const cells = new Set<{ center: THREE.Vector3; radius: number; geometry: THREE.BufferGeometry; waterTerrain:boolean; tree?: Octree }>();
  const colliderMaterial = new THREE.MeshBasicMaterial();
  const pressed=new Set<string>();
  function refreshColliders() {
    trees.length = 0;
    for (const cell of cells) {
      if(cell.waterTerrain&&isWaterAt(controller.position.x,controller.position.z))continue;
      const distance = Math.hypot(cell.center.x - controller.position.x, cell.center.z - controller.position.z);
      // Keep a wider retention ring than the active ring, avoiding repeated
      // octree construction while crossing a cell boundary.
      if (distance > cell.radius + 180) { cell.tree = undefined; continue; }
      if (distance > cell.radius + 60) continue;
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
  ui.innerHTML = `<button class="flight-toggle">飛んでみる</button><div class="flight-instructions" hidden><span class="flight-depth"></span></div><div class="flight-pad" role="group" aria-label="移動スティック" hidden><div class="flight-knob"></div></div><div class="flight-vertical" hidden><button data-dir="1"><span class="flight-control-icon" aria-hidden="true">↑</span><span class="flight-control-label">上がる</span></button><button data-dir="-1"><span class="flight-control-icon" aria-hidden="true">↓</span><span class="flight-control-label">降りる</span></button></div>`;
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
  let cruise:Array<{x:number;z:number}>|null=null,cruiseIndex=0;
  let bestDistance = Infinity;
  let stalled = 0, cruiseStalled = 0;
  let startX = 0, startY = 0, dragged = false;
  let pressStarted = 0;

  function cancelTravel() {
    destination = null;cruise=null;cruiseStalled=0;controller.autopilotSpeed=undefined;
  }

  let savedPosition = camera.position.clone();
  let lookId: number | null = null, lastX = 0, lastY = 0;
  function setMode(active: boolean, start?: THREE.Vector3) {
    pressed.clear();cancelTravel();
    if (active&&!controller.active) savedPosition.copy(camera.position);
    controller.activate(active);controller.setVehicle('none');character.setVehicle('none');lastVehicle='none';onVehicleChange('none');photoPose=null;
    if (active && start) controller.position.copy(start);
    controls.enabled = !active; character.group.visible = active;
    if (!active) { camera.position.copy(savedPosition); controls.update(); setUnderwater(false); }
    guide.hidden = !active; pad.hidden = !active; vertical.hidden = !active;
    toggle.textContent = active ? 'マップに戻る' : '飛んでみる';
    controller.setStick(0, 0); controller.setVertical(0);
  }
  toggle.hidden = true; // The visible start button is owned by React.
  toggle.onclick = () => setMode(!controller.active);
  function stick(e: PointerEvent) { const rect = pad.getBoundingClientRect(); let x = (e.clientX - rect.left - rect.width / 2) / (rect.width * .38); let y = -(e.clientY - rect.top - rect.height / 2) / (rect.height * .38); const m = Math.hypot(x,y); if (m > 1) { x /= m; y /= m; } controller.setStick(x,y); knob.style.transform = `translate(${x * rect.width * .28}px, ${-y * rect.width * .28}px)`; }
  pad.onpointerdown = e => { e.preventDefault(); cancelTravel(); pad.setPointerCapture(e.pointerId); stick(e); };
  pad.onpointermove = e => { if (pad.hasPointerCapture(e.pointerId)) stick(e); };
  const stopStick = () => { controller.setStick(0,0); knob.style.transform = ''; };
  pad.onpointerup = stopStick; pad.onpointercancel = stopStick; pad.onlostpointercapture = stopStick;
  const rise = vertical.querySelector<HTMLButtonElement>('[data-dir="1"]')!;
  const drop = vertical.querySelector<HTMLButtonElement>('[data-dir="-1"]')!;
  const riseLabel=rise.querySelector<HTMLElement>('.flight-control-label')!,dropLabel=drop.querySelector<HTMLElement>('.flight-control-label')!;
  let verticalPointer:number|null=null;
  const stopVertical=()=>{verticalPointer=null;controller.setVertical(0);};
  const verticalReleased=(e:PointerEvent)=>{if(e.pointerId===verticalPointer)stopVertical();};
  window.addEventListener('pointerup',verticalReleased);window.addEventListener('pointercancel',verticalReleased);
  rise.onpointerdown = e => {
    e.preventDefault();
    cancelTravel();
    verticalPointer=e.pointerId;rise.setPointerCapture(e.pointerId);
    controller.setVertical(1);
  };
  rise.onpointerup = rise.onpointercancel = rise.onlostpointercapture = stopVertical;
  drop.onpointerdown=e=>{e.preventDefault();if(controller.state==='ground')return;cancelTravel();verticalPointer=e.pointerId;drop.setPointerCapture(e.pointerId);controller.setVertical(-1);};
  drop.onpointerup=drop.onpointercancel=drop.onlostpointercapture=stopVertical;
  const stopInputs=()=>{pressed.clear();stopStick();stopVertical();controller.velocity.set(0,0,0);cancelTravel();lookId=null;};
  const hidden=()=>{if(document.hidden)stopInputs();};
  const keyboardCodes=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyE','KeyQ']);
  const syncKeyboard=()=>{controller.setStick(Number(pressed.has('KeyD')||pressed.has('ArrowRight'))-Number(pressed.has('KeyA')||pressed.has('ArrowLeft')),Number(pressed.has('KeyW')||pressed.has('ArrowUp'))-Number(pressed.has('KeyS')||pressed.has('ArrowDown')));controller.setVertical(Number(pressed.has('KeyE'))-Number(pressed.has('KeyQ')));};
  const editing=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable="true"],dialog,.scenery-photo-overlay');
  const keyDown=(e:KeyboardEvent)=>{if(!controller.active||photoPose!==null||!keyboardCodes.has(e.code)||e.ctrlKey||e.metaKey||e.altKey)return;if(editing(e.target)||document.querySelector('dialog[open],.scenery-photo-overlay,.world-travel[open]')){stopInputs();return;}e.preventDefault();if(pressed.has(e.code))return;cancelTravel();pressed.add(e.code);syncKeyboard();};
  const keyUp=(e:KeyboardEvent)=>{if(pressed.delete(e.code)){e.preventDefault();syncKeyboard();}};
  const focused=(e:FocusEvent)=>{if(editing(e.target))stopInputs();};
  const verticalKey=(direction:number)=>(e:KeyboardEvent)=>{if(e.code!=='Space'&&e.code!=='Enter')return;e.preventDefault();if(direction<0&&controller.state==='ground')return;cancelTravel();controller.setVertical(direction);};
  rise.onkeydown=verticalKey(1);drop.onkeydown=verticalKey(-1);
  rise.onkeyup=drop.onkeyup=e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();stopVertical();}};
  rise.onblur=drop.onblur=stopVertical;
  window.addEventListener('keydown',keyDown);window.addEventListener('keyup',keyUp);document.addEventListener('focusin',focused);
  window.addEventListener('blur',stopInputs);
  document.addEventListener('visibilitychange',hidden);

  function lookDown(e: PointerEvent) {
    if (!controller.active || photoPose!==null || lookId !== null || e.button !== 0) return;
    lookId = e.pointerId;
    pressStarted = performance.now();
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
    if (e.type !== 'pointerup' || dragged || !controller.active || performance.now()-pressStarted >= 500) return;
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
  function previewPose(){
    character.setVisible(controller.active&&photoPose!=='none');
    if(photoPose&&photoPose!=='none'){
      const dx=camera.position.x-controller.position.x,dz=camera.position.z-controller.position.z;
      character.applyPhotoPose(photoPose,Math.atan2(-dx,-dz));
    }
  }
  return {
    setMode,
    setAvatar(id:AvatarId){avatarId=id;character.setAvatar(id);},
    setPhotoPose(pose:PhotoPose|null){const savedCruise=cruise;stopInputs();cruise=savedCruise;controller.autopilotSpeed=cruise?3.5:undefined;photoPose=pose;if(pose!==null)previewPose();else character.setVisible(controller.active);},
    setVehicle(id:VehicleId){stopInputs();const accepted=controller.setVehicle(id,trees);if(accepted){character.setVehicle(id);lastVehicle=id;onVehicleChange(id);}return accepted;},
    startBoatTrip(region:'harbor'|'river'='harbor',tour=false){
      const candidates=region==='harbor'?[{x:-100,z:-140},{x:-125,z:-130}]:[{x:325,z:-700},{x:175,z:-1000},{x:125,z:-1600}];
      const start=candidates.find(p=>boatFitsWater(isWaterAt,p.x,p.z));if(!start)return false;
      const path=tour?cruisePath(isWaterAt,start.x,start.z):null;if(tour&&!path)return false;
      const first=path?.[0]??start;setMode(true,new THREE.Vector3(first.x,SEA+.04,first.z));controller.setVehicle('boat');character.setPosition(controller.position);character.setVehicle('boat');lastVehicle='boat';onVehicleChange('boat');
      cruise=path;cruiseIndex=1;controller.autopilotSpeed=tour?3.5:undefined;return true;
    },
    startCarTrip(){
      const previous=controller.position.clone();controller.position.set(-170,45,-140);refreshColliders();controller.position.copy(previous);
      let parking:THREE.Vector3|null=null;
      for(const x of [-170,-180,-160,-190,-150]){for(const z of [-140,-150,-130,-160,-120]){parking=controller.findCarParking(trees,x,z);if(parking)break;}if(parking)break;}
      if(!parking)return false;
      setMode(true,parking);if(!controller.parkCarAt(trees,parking.x,parking.z))return false;
      character.setPosition(controller.position);character.resetOrientation(0);character.setVehicle('car');lastVehicle='car';onVehicleChange('car');return true;
    },
    startSubmarineTrip(){if(!isWaterAt(-100,-140))return false;setMode(true,new THREE.Vector3(-100,SEA-2,-140));controller.state='water';controller.setVehicle('submarine');character.setPosition(controller.position);character.setVehicle('submarine');lastVehicle='submarine';onVehicleChange('submarine');return true;},
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
          // 50 m cells rather than 250 m cells: build only nearby collision
          // trees instead of blocking flight on a large district's triangles.
          const key = `${Math.floor((vertices[0]+vertices[3]+vertices[6])/150)},${Math.floor((vertices[2]+vertices[5]+vertices[8])/150)}`;
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
    update(dt: number, time: number) { if (!controller.active) return;if(photoPose!==null){previewPose();return;} refreshColliders();
      if(cruise){const next=cruise[cruiseIndex%cruise.length];destination=new THREE.Vector3(next.x,SEA+.04,next.z);if(controller.position.distanceTo(destination)<1.2)cruiseIndex++;}
      controller.update(dt, trees, character, camera, time, destination);
      if(cruise){cruiseStalled=controller.velocity.length()<.2?cruiseStalled+dt:0;if(cruiseStalled>5)cancelTravel();}
      if(controller.vehicle!==lastVehicle){lastVehicle=controller.vehicle;onVehicleChange(lastVehicle);}
      dropLabel.textContent = controller.state==='water'?'潜る':'降りる';
      if (destination&&!cruise) {
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
       const data=controller.getHookData(); riseLabel.textContent=controller.vehicle==='boat'?'乗船中':controller.vehicle==='car'?'乗車中':data.state==='ground'?'飛び立つ':'上がる';rise.disabled=controller.vehicle==='car'||controller.vehicle==='boat';drop.disabled=data.state==='ground'||controller.vehicle==='boat'; depth.textContent = (controller.vehicle==='submarine'?'潜水艇 · ':controller.vehicle==='boat'?`${cruise?'遊覧船':'ボート'} · ${(data.speed*3.6).toFixed(0)}km/h · `:controller.vehicle==='car'?`ミニカー · ${(data.speed*3.6).toFixed(0)}km/h · `:'')+(data.state==='ground'?'徒歩':data.state === 'water' ? `水深 ${data.depth.toFixed(1)}m` : `高度 ${data.altitude.toFixed(1)}m`); setUnderwater(data.state === 'water'); },
    getNetworkPose() { return {avatar:avatarId,vehicle:controller.vehicle,pose:photoPose??'natural',x:controller.position.x,y:controller.position.y,z:controller.position.z,vx:controller.velocity.x,vy:controller.velocity.y,vz:controller.velocity.z,yaw:Math.atan2(Math.sin(character.getYaw()),Math.cos(character.getYaw())),speed:controller.velocity.length(),state:controller.state,active:controller.active}; },
    getPosition() { return controller.position; },
    getStatus() { return controller.getHookData(); },
    setWaterQuery(query:(x:number,z:number)=>boolean){isWaterAt=query;controller.setWaterQuery(query);},
    isActive() { return controller.active; },
    withoutCharacter<T>(capture:()=>T):T {
      const visible=character.group.visible;character.group.visible=false;
      try{return capture();}finally{character.group.visible=visible;}
    },
    dispose() { stopInputs();window.removeEventListener('keydown',keyDown);window.removeEventListener('keyup',keyUp);document.removeEventListener('focusin',focused);window.removeEventListener('pointerup',verticalReleased);window.removeEventListener('pointercancel',verticalReleased);window.removeEventListener('blur',stopInputs);document.removeEventListener('visibilitychange',hidden);canvas.removeEventListener('pointerdown',lookDown); canvas.removeEventListener('pointermove',lookMove); canvas.removeEventListener('pointerup',lookUp); canvas.removeEventListener('pointercancel',lookUp); ui.remove(); cells.forEach(cell => cell.geometry.dispose()); cells.clear(); trees.length = 0; colliderMaterial.dispose(); character.dispose(); }
  };
}
