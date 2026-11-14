import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {Octree} from 'three/examples/jsm/math/Octree.js';
import {FreeFlightController} from '../features/exploration/map/flight/freeFlight';
import {HumanoidCharacter} from '../features/exploration/map/flight/character';

function floor(top=45,width=100){const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,.5,width),new THREE.MeshBasicMaterial());mesh.position.y=top-.25;return mesh;}
function setup(meshes:THREE.Mesh[],x=0,y=50,z=0){
 const group=new THREE.Group();meshes.forEach(m=>group.add(m));const tree=new Octree().fromGraphNode(group);
 const controller=new FreeFlightController();controller.activate(true);controller.teleport(x,y,z);
 const character=new HumanoidCharacter(),camera=new THREE.PerspectiveCamera(45,1,.1,1000);let time=0;
 const tick=(frames:number,falling=false,colliders=[tree])=>{for(let i=0;i<frames;i++){time+=1/60;controller.update(1/60,colliders,character,camera,time,null,falling);}};
 const land=()=>{for(let i=0;i<240&&controller.state!=='ground';i++)tick(1,true);expect(controller.state).toBe('ground');};
 return{controller,character,camera,tick,land};
}

describe('walking after landing',()=>{
 it('stays on the floor while looking up, walks at ground speed, and stops without hovering',()=>{
  const {controller,character,camera,tick,land}=setup([floor()]);land();controller.setLookDegrees(0,50);controller.setStick(0,1);
  for(let i=0;i<180;i++){tick(1);expect(controller.state).toBe('ground');expect(controller.position.y).toBeCloseTo(45.001,3);}
  expect(camera.position.y).toBeGreaterThan(controller.position.y+1.6);
  expect(controller.position.z).toBeLessThan(-6);expect(controller.velocity.length()).toBeLessThanOrEqual(2.601);
  const leg=character.group.getObjectByName('left-leg')!,other=character.group.getObjectByName('right-leg')!;
  expect(Math.abs(leg.rotation.x)).toBeGreaterThan(.01);expect(leg.rotation.x).toBeCloseTo(-other.rotation.x,5);
  controller.setStick(0,0);tick(180);expect(controller.velocity.length()).toBe(0);expect(controller.state).toBe('ground');expect(leg.rotation.x).toBe(0);
 });
 it('keeps ground contact over a slope',()=>{
  const ramp=new THREE.Mesh(new THREE.PlaneGeometry(40,40),new THREE.MeshBasicMaterial());ramp.rotation.set(-Math.PI/2,0,.12,'ZXY');ramp.position.y=45;
  const {controller,tick,land}=setup([ramp],-5,50);land();controller.setLookDegrees(90,40);controller.setStick(0,1);tick(180);
  expect(controller.state).toBe('ground');expect(controller.position.x).toBeGreaterThan(0);
  expect(controller.position.y).toBeCloseTo(45+Math.tan(.12)*controller.position.x+.001,1);
 });
 it('does not climb through a wall while walking',()=>{
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,8,20),new THREE.MeshBasicMaterial());wall.position.set(4,49,0);
  const {controller,tick,land}=setup([floor(),wall]);land();controller.setLookDegrees(90,60);controller.setStick(0,1);tick(240);
  expect(controller.position.x).toBeLessThanOrEqual(3.31);expect(controller.position.y).toBeCloseTo(45.001,2);expect(controller.state).toBe('ground');
 });
 it('takes off only with the upward command',()=>{
  const {controller,tick,land}=setup([floor()]);land();controller.setVertical(1);tick(30);
  expect(controller.state).toBe('air');expect(controller.position.y).toBeGreaterThan(48);
 });
 it('falls when walking off an edge or losing the supporting chunk',()=>{
  const {controller,tick,land}=setup([floor()]);land();tick(60,false,[]);
  expect(controller.position.y).toBeLessThan(43);expect(controller.state).not.toBe('ground');
 });
 it('steps off a ledge instead of hovering in midair',()=>{
  const {controller,tick,land}=setup([floor(45,10)],3,50);land();controller.setLookDegrees(90,0);controller.setStick(0,1);tick(150);
  expect(controller.position.x).toBeGreaterThan(5);expect(controller.position.y).toBeLessThan(44.8);expect(controller.state).not.toBe('ground');
 });
 it('walks on low coastal land and swims only when the location is water',()=>{
  const {controller,tick,land}=setup([floor(40)]);controller.setWaterQuery(()=>false);land();tick(30);
  expect(controller.state).toBe('ground');expect(controller.position.y).toBeCloseTo(40.001,3);
  controller.setWaterQuery(()=>true);tick(1);expect(controller.state).toBe('water');
 });
});
