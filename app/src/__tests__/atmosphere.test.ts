import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {resolveAtmosphere,validAtmosphere} from '../features/exploration/map/atmosphere';
import {createPortSky} from '../features/exploration/map/three/portSky';
import {createWorldAtmosphere} from '../features/exploration/map/three/worldAtmosphere';
describe('time and season',()=>{
 it('uses Japanese dates, including midnight and season changes',()=>{
  const choice={time:'auto',season:'auto'} as const;
  expect(resolveAtmosphere(choice,new Date('2026-02-28T14:59:00Z')).season).toBe('winter');
  const next=resolveAtmosphere(choice,new Date('2026-02-28T15:00:00Z'));expect(next.season).toBe('spring');expect(next.hour).toBe(0);
 });
 it('keeps manual time and season independent from the device date',()=>{
  const p=resolveAtmosphere({time:'day',season:'summer'},new Date('2026-12-01T16:00:00Z'));expect(p.season).toBe('summer');expect(p.hour).toBe(12);expect(p.a.night).toBe(0);expect(validAtmosphere({time:'fast',season:'snow'})).toBe(false);
 });
 it('restores original material colors after night and updates newly streamed materials',()=>{
  const scene=new THREE.Scene(),sky=createPortSky(scene),ambient=new THREE.AmbientLight(),sun=new THREE.DirectionalLight(),fill=new THREE.DirectionalLight();
  const original=new THREE.Color(0xaabbcc),material=new THREE.MeshBasicMaterial({color:original});scene.add(new THREE.Mesh(new THREE.BoxGeometry(),material));const engine=createWorldAtmosphere(scene,sky,ambient,sun,fill);
  engine.update({time:'night',season:'winter'},0);expect(material.color.r).toBeLessThan(original.r);
  engine.update({time:'day',season:'summer'},1000);expect(material.color.equals(original)).toBe(true);
  engine.update({time:'night',season:'summer'},2000);const next=new THREE.MeshBasicMaterial({color:original});scene.add(new THREE.Mesh(new THREE.BoxGeometry(),next));engine.update({time:'night',season:'summer'},3000);expect(next.color.r).toBeCloseTo(material.color.r);
  sky.setUnderwater(true);const underwaterFog=scene.fog;engine.update({time:'evening',season:'spring'},4000);expect(scene.fog).toBe(underwaterFog);sky.setUnderwater(false);expect(scene.fog).not.toBe(underwaterFog);engine.dispose();sky.dispose();
 });
});
