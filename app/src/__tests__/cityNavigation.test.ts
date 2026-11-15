import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {emphasizeBuildingHeights} from '../features/exploration/map/three/buildingHeight';
import {cameraHeading,CITY_LANDMARKS} from '../features/exploration/navigation';
import city from '../features/exploration/cityStructures.v1.json';
function building(x:number,base:number,height:number){const mesh=new THREE.Mesh(new THREE.BoxGeometry(8,height,8),new THREE.MeshStandardMaterial());mesh.position.set(x,base+height/2,0);return mesh;}
describe('readable city landmarks and heights',()=>{
 it('raises separate roofs from their own ground without shifting streets, footprints or UVs',()=>{
  const group=new THREE.Group(),a=building(0,42,10),b=building(20,49,20);group.add(a,b);const uv=Array.from(a.geometry.getAttribute('uv').array);emphasizeBuildingHeights(group);group.updateMatrixWorld(true);
  const ba=new THREE.Box3().setFromObject(a),bb=new THREE.Box3().setFromObject(b);
  expect(ba.min.y).toBeCloseTo(42);expect(ba.max.y).toBeCloseTo(55);expect(bb.min.y).toBeCloseTo(49);expect(bb.max.y).toBeCloseTo(75);expect(ba.min.x).toBe(-4);expect(bb.max.x).toBe(24);expect(Array.from(a.geometry.getAttribute('uv').array)).toEqual(uv);
  emphasizeBuildingHeights(group);expect(new THREE.Box3().setFromObject(a).max.y).toBeCloseTo(55);
 });
 it('joins separate roof and wall materials, retaining quantized input precision without clipping raised vertices',()=>{
  const group=new THREE.Group(),walls=building(0,42,10),roof=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshStandardMaterial());roof.rotation.x=-Math.PI/2;roof.position.y=52;const p=walls.geometry.getAttribute('position'),q=new Int16Array(p.count*3);for(let i=0;i<p.count;i++){q[i*3]=Math.round(p.getX(i)/4*32767);q[i*3+1]=Math.round(p.getY(i)/5*32767);q[i*3+2]=Math.round(p.getZ(i)/4*32767);}walls.geometry.setAttribute('position',new THREE.BufferAttribute(q,3,true));walls.scale.set(4,5,4);group.add(walls,roof);emphasizeBuildingHeights(group);
  expect(new THREE.Box3().setFromObject(roof).min.y).toBeCloseTo(55);expect(group.userData.heightComponents).toBe(1);expect(walls.geometry.getAttribute('position').array).toBeInstanceOf(Float32Array);expect(new THREE.Box3().setFromObject(walls).max.y).toBeCloseTo(55);
 });
 it('maps camera directions to true ENU north/east/south/west and keeps heading when looking straight down',()=>{
  expect(cameraHeading(0,-1)).toBe(0);expect(cameraHeading(1,0)).toBe(90);expect(cameraHeading(0,1)).toBe(180);expect(cameraHeading(-1,0)).toBe(270);expect(cameraHeading(0,0,137)).toBe(137);
  expect(CITY_LANDMARKS.find(p=>p.id==='station')!.z).toBeLessThan(CITY_LANDMARKS.find(p=>p.id==='port')!.z);
 });
 it('uses four named GSI bridge centerlines, separate from the approximate modeling dimensions',()=>{
  expect(new Set(city.bridges.map(b=>b.name))).toEqual(new Set(['港大橋','永代橋','御成橋','三園橋']));
  expect(city.sourceUrls.every(url=>url.startsWith('https://cyberjapandata.gsi.go.jp/'))).toBe(true);
  for(const bridge of city.bridges){expect(bridge.sourceFeatureCode).toBe(2703);expect(Math.hypot(bridge.a.x-bridge.b.x,bridge.a.z-bridge.b.z)).toBeGreaterThan(100);expect(bridge.center.x).toBeCloseTo((bridge.a.x+bridge.b.x)/2);}
  expect(city.watergate.sourceFeatureCode).toBe(5515);expect(city.watergate.center.x).toBeLessThan(0);
 });
});
