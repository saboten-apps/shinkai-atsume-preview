import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {createCityHall,cityHallPoint,removeCityHallSource} from '../features/exploration/map/three/cityHall';

describe('photo-reference city hall',()=>{
 it('has an open entrance, solid roof and columns, and bounded detail rendering',()=>{
  const hall=createCityHall();
  const ray=(a:THREE.Vector3,b:THREE.Vector3,distance:number)=>new THREE.Raycaster(a,b.clone().sub(a).normalize(),0,distance).intersectObject(hall.collider,true);
  expect(ray(cityHallPoint(0,2,40),cityHallPoint(0,2,25),12)).toHaveLength(0);
  expect(ray(cityHallPoint(0,5,33),cityHallPoint(0,10,33),10).length).toBeGreaterThan(0);
  expect(ray(cityHallPoint(12,3,45),cityHallPoint(12,3,39),10).length).toBeGreaterThan(0);
  const near=hall.root.getObjectByName('city-hall-near-details')!;
  hall.update(cityHallPoint(0,4,40));expect(near.visible).toBe(true);
  hall.update(cityHallPoint(0,4,700));expect(near.visible).toBe(false);
  let triangles=0,draws=0;
  hall.root.traverse(o=>{if(o instanceof THREE.Mesh){triangles+=(o.geometry.index?.count??0)/3;draws++;}});
  expect(triangles).toBeLessThan(25000);expect(draws).toBeLessThan(15);
  const dispose=vi.spyOn((hall.collider.children[0] as THREE.Mesh).geometry,'dispose');hall.dispose();hall.dispose();expect(dispose).toHaveBeenCalledTimes(1);
 });
 it('only removes matched source components and preserves unrelated material groups',()=>{
  const group=new THREE.Group();
  const main=new THREE.Mesh(new THREE.BoxGeometry(25,45,45));main.position.set(548,65,-1565);group.add(main);
  const entrance=new THREE.Mesh(new THREE.BoxGeometry(40,8,20));entrance.position.set(550,47,-1532);group.add(entrance);
  const neighbor=new THREE.Mesh(new THREE.BoxGeometry(10,10,10));neighbor.position.set(610,48,-1532);group.add(neighbor);
  const count=neighbor.geometry.index!.count,groups=structuredClone(neighbor.geometry.groups);
  const result=removeCityHallSource(group);expect(result.components).toBe(2);expect(result.triangles).toBe(24);
  expect(main.geometry.index!.count).toBe(0);expect(entrance.geometry.index!.count).toBe(0);
  expect(neighbor.geometry.index!.count).toBe(count);expect(neighbor.geometry.groups).toEqual(groups);
 });
 it('keeps all source geometry if either component cannot be identified',()=>{
  const group=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(25,45,45));mesh.position.set(548,65,-1565);group.add(mesh);
  const count=mesh.geometry.index!.count;expect(removeCityHallSource(group).components).toBe(0);expect(mesh.geometry.index!.count).toBe(count);
 });
});
