import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {Octree} from 'three/examples/jsm/math/Octree.js';
import {FreeFlightController} from '../features/exploration/map/flight/freeFlight';
import {HumanoidCharacter} from '../features/exploration/map/flight/character';
function setup(width=150,wall=false){const g=new THREE.Group(),floor=new THREE.Mesh(new THREE.BoxGeometry(width,.5,width),new THREE.MeshBasicMaterial());floor.position.y=44.75;g.add(floor);if(wall){const w=new THREE.Mesh(new THREE.BoxGeometry(.2,8,20),new THREE.MeshBasicMaterial());w.position.set(7,49,0);g.add(w);}g.updateMatrixWorld(true);const trees=[new Octree().fromGraphNode(g)],p=new FreeFlightController(),c=new HumanoidCharacter(),camera=new THREE.PerspectiveCamera();p.setWaterQuery(()=>false);p.activate(true);const tick=(n:number)=>{for(let i=0;i<n;i++)p.update(1/60,trees,c,camera,i/60);};return{p,c,trees,tick};}
describe('ground car',()=>{
 it('requires a dry supported surface and clearance before boarding',()=>{
  const {p,c,trees}=setup(100,true);expect(p.setVehicle('car',trees)).toBe(false);expect(p.parkCarAt(trees,0,0)).toBe(true);expect(p.vehicle).toBe('car');
  const before=p.position.clone();expect(p.parkCarAt(trees,6.5,0)).toBe(false);expect(p.position.equals(before)).toBe(true);expect(p.parkCarAt(trees,1000,0)).toBe(false);p.setWaterQuery(()=>true);expect(p.parkCarAt(trees,0,0)).toBe(false);p.position.y=35;expect(p.setVehicle('car',trees)).toBe(false);c.dispose();
 });
 it('drives faster than walking, stays level on up input, stops and returns to walking after leaving',()=>{
  const {p,c,trees,tick}=setup(300);p.parkCarAt(trees,0,0);p.setVertical(1);p.setStick(0,1);tick(240);expect(p.position.y).toBeCloseTo(45.001,2);expect(p.state).toBe('ground');expect(p.vehicle).toBe('car');expect(p.velocity.length()).toBeGreaterThan(11.8);expect(p.velocity.length()).toBeLessThanOrEqual(12.001);
  p.setStick(0,0);tick(180);expect(p.velocity.length()).toBe(0);expect(c.group.getObjectByName('personal-car')!.visible).toBe(true);expect(c.group.getObjectByName('personal-car')!.children).toHaveLength(3);
  p.setVehicle('none');p.setVertical(0);p.setStick(0,1);tick(120);expect(p.velocity.length()).toBeLessThanOrEqual(5.501);expect(c.group.getObjectByName('personal-car')!.visible).toBe(false);c.dispose();
 });
 it('uses a wider collision footprint to stop before a wall and points along its movement',()=>{
  const {p,c,trees,tick}=setup(150,true);p.parkCarAt(trees,0,0);p.setLookDegrees(90,0);p.setStick(0,1);tick(90);expect(p.position.x).toBeLessThanOrEqual(5.71);expect(p.position.x).toBeGreaterThan(5);expect(p.position.y).toBeCloseTo(45.001,2);expect(p.vehicle).toBe('car');expect(Math.sin(c.getYaw())).toBeLessThan(-.8);c.dispose();
 });
 it('leaves the car at an unsupported ledge and in water, and rejects roofs as harbor parking',()=>{
  const {p,c,trees,tick}=setup(10);p.parkCarAt(trees,0,0);p.setStick(0,1);tick(180);expect(p.vehicle).toBe('none');expect(p.position.y).toBeLessThan(45);
  p.setWaterQuery(()=>true);p.position.y=35;p.update(1/60,trees,c,new THREE.PerspectiveCamera(),4);expect(p.vehicle).toBe('none');
  const roof=new THREE.Mesh(new THREE.BoxGeometry(10,.5,10),new THREE.MeshBasicMaterial());roof.position.y=60;roof.updateMatrixWorld(true);p.setWaterQuery(()=>false);expect(p.findCarParking([new Octree().fromGraphNode(roof)],0,0)).toBeNull();c.dispose();
 });
});
