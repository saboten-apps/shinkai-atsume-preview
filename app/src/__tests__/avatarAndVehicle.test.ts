import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {HumanoidCharacter} from '../features/exploration/map/flight/character';
import {AVATARS,isAvatar,isPhotoPose,loadAvatar,AVATAR_KEY} from '../features/exploration/map/flight/avatarOptions';
import {FreeFlightController,SEA} from '../features/exploration/map/flight/freeFlight';
describe('diver choices and photography',()=>{
 it('switches shape features without replacing or leaking the model',()=>{
  const c=new HumanoidCharacter(),geometries=new Set<THREE.BufferGeometry>();c.group.traverse(o=>{if(o instanceof THREE.Mesh)geometries.add(o.geometry);});
  for(const id of AVATARS.map(a=>a.id)){
   c.setAvatar(id);expect(c.group.userData.avatar).toBe(id);expect(c.group.getObjectByName('jelly-skirt')!.visible).toBe(id==='jellyfish');expect(c.group.getObjectByName('angler-lure')!.visible).toBe(id==='angler');
   c.group.traverse(o=>{if(o instanceof THREE.Mesh)expect(geometries.has(o.geometry)).toBe(true);});
  }
  const disposed=vi.fn();geometries.forEach(g=>g.addEventListener('dispose',disposed));c.dispose();expect(disposed).toHaveBeenCalledTimes(geometries.size);
 });
 it('poses both arms, faces the camera and returns to normal movement',()=>{
  const c=new HumanoidCharacter(),left=c.group.getObjectByName('left-arm')!,right=c.group.getObjectByName('right-arm')!;
  c.applyPhotoPose('cheer',Math.PI);expect(left.rotation.z).toBeGreaterThan(2);expect(right.rotation.z).toBeLessThan(-2);expect(c.getYaw()).toBe(Math.PI);
  c.applyPhotoPose('wave',0);expect(left.rotation.z).toBeGreaterThan(2);expect(right.rotation.z).toBeCloseTo(-.08);
  c.applyPhotoPose('salute',0);const hand=new THREE.Vector3(0,-.4,0).applyQuaternion(right.quaternion);expect(hand.y).toBeGreaterThan(.2);expect(hand.z).toBeLessThan(-.2);
  c.updatePose(0,0,22,'air',1/60,0);expect(left.rotation.z).toBeCloseTo(.15);expect(right.rotation.x).toBe(0);c.dispose();
 });
 it('validates and restores only known character ids',()=>{
  vi.stubGlobal('localStorage',{getItem:(key:string)=>key===AVATAR_KEY?'angler':null});expect(loadAvatar()).toBe('angler');
  vi.stubGlobal('localStorage',{getItem:()=>'{bad}'});expect(loadAvatar()).toBe('mendako');vi.unstubAllGlobals();
  expect(isAvatar('unknown')).toBe(false);expect(isPhotoPose('wave')).toBe(true);expect(isPhotoPose('<script>')).toBe(false);
 });
});
describe('personal submarine',()=>{
 it('boards only in water, moves level at its capped speed, and leaves at the surface',()=>{
  const p=new FreeFlightController(),c=new HumanoidCharacter(),camera=new THREE.PerspectiveCamera();p.activate(true);p.setWaterQuery(()=>true);
  expect(p.setVehicle('submarine')).toBe(false);p.teleport(-100,SEA-2,-140);expect(p.setVehicle('submarine')).toBe(true);p.setStick(0,1);
  for(let i=0;i<240;i++)p.update(1/60,[],c,camera,i/60);expect(p.velocity.length()).toBeGreaterThan(14.8);expect(p.velocity.length()).toBeLessThanOrEqual(15);expect(p.position.y).toBeCloseTo(SEA-2);expect(c.group.getObjectByName('personal-submarine')!.visible).toBe(true);
  p.position.y=SEA+1;p.update(1/60,[],c,camera,5);expect(p.vehicle).toBe('none');expect(c.group.getObjectByName('personal-submarine')!.visible).toBe(false);c.dispose();
 });
 it('keeps depth on release, clears the vehicle on teleport or exit, and keeps only three vehicle meshes',()=>{
  const p=new FreeFlightController(),c=new HumanoidCharacter(),camera=new THREE.PerspectiveCamera();p.activate(true);p.teleport(0,35,0);p.setVehicle('submarine');p.setVertical(-1);for(let i=0;i<20;i++)p.update(1/60,[],c,camera,i/60);
  p.setVertical(0);const depth=p.position.y;p.update(1/60,[],c,camera,1);expect(p.position.y).toBeCloseTo(depth);expect(c.group.getObjectByName('personal-submarine')!.children).toHaveLength(3);
  p.teleport(0,35,0);expect(p.vehicle).toBe('none');p.setVehicle('submarine');p.activate(false);expect(p.vehicle).toBe('none');c.dispose();
 });
});
