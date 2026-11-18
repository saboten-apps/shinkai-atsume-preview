import {afterEach,describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {HuntTracker,huntKind,fishMotion} from '../features/exploration/huntRules';
import {cruisePath,boatFitsWater} from '../features/exploration/map/flight/boat';
import {FreeFlightController,SEA} from '../features/exploration/map/flight/freeFlight';
import {HumanoidCharacter} from '../features/exploration/map/flight/character';
import {matchPhotoMissions,recordPhotoAchievements,loadPhotoAchievements,PHOTO_MISSION_KEY} from '../features/scenery/photoMissions';
import {VIEWS,type Viewpoint} from '../features/scenery/viewpoint';
afterEach(()=>vi.unstubAllGlobals());
const input={active:true,distance:10,visible:true,night:true,light:true,aim:1};
describe('fish-specific observation challenges',()=>{
 it('requires continuous close observation and resets after moving or losing sight',()=>{const t=new HuntTracker('observe');for(let i=0;i<4;i++)t.update(.2,input);expect(t.update(.1,input).ready).toBe(true);expect(t.update(.1,{...input,visible:false}).progress).toBe(0);expect(t.update(.1,{...input,distance:100}).ready).toBe(false);});
 it('requires night and an aimed survey light for the corresponding fish',()=>{for(const [kind,change]of [['night',{night:false}],['light',{light:false}],['light',{aim:.5}]] as const){const t=new HuntTracker(kind);for(let i=0;i<50;i++)expect(t.update(.2,{...input,...change}).ready).toBe(false);}expect(huntKind('f02')).toBe('night');expect(huntKind('f01')).toBe('light');expect(huntKind('f03')).toBe('school');expect(huntKind('f07')).toBe('track');});
 it('does not skip observation during a long pause and keeps motion bounded with reduced motion stationary',()=>{expect(new HuntTracker('night').update(100,input).ready).toBe(false);for(let i=0;i<100;i++){const m=fishMotion('f07',1,i);expect(Math.abs(m.x)).toBeLessThanOrEqual(9);expect(Math.abs(m.z)).toBeLessThanOrEqual(7);}expect(fishMotion('f03',1,2,true)).toEqual(fishMotion('f03',1,100,true));});
});
describe('surface boats',()=>{
 it('checks the whole footprint and uses only verified cruise routes',()=>{const wet=(x:number,z:number)=>Math.hypot(x,z)<30;expect(cruisePath(wet,0,0)).toHaveLength(32);for(const p of cruisePath(wet,0,0)!)expect(boatFitsWater(wet,p.x,p.z)).toBe(true);expect(boatFitsWater(wet,29,0)).toBe(false);expect(cruisePath(()=>false,0,0)).toBeNull();});
 it('holds surface height, cannot drive ashore or fly, and limits speed',()=>{const p=new FreeFlightController(),c=new HumanoidCharacter(),cam=new THREE.PerspectiveCamera();p.activate(true);p.setWaterQuery((x,z)=>Math.abs(x)<25&&Math.abs(z)<25);p.teleport(0,SEA+.04,0);expect(p.setVehicle('boat')).toBe(true);p.setVertical(1);p.setStick(0,1);for(let i=0;i<500;i++)p.update(1/60,[],c,cam,i/60);expect(p.position.y).toBeCloseTo(SEA+.04);expect(p.position.z).toBeGreaterThan(-24);expect(p.velocity.length()).toBeLessThanOrEqual(8);expect(p.vehicle).toBe('boat');expect(c.group.getObjectByName('personal-boat')!.visible).toBe(true);p.setLookDegrees(0,60);p.update(1/60,[],c,cam,9);expect(cam.position.y).toBeGreaterThanOrEqual(SEA+2);p.setVehicle('none');p.update(1/60,[],c,cam,10);expect(c.group.getObjectByName('personal-boat')!.visible).toBe(false);p.teleport(40,SEA,40);expect(p.setVehicle('boat')).toBe(false);c.dispose();});
});
describe('photo challenge achievements',()=>{
 it('requires the correct view, facing direction, time and player/vehicle presence',()=>{
  const night={...VIEWS['onari-bridge'].view,atmosphere:{time:'night',season:'winter'}} as Viewpoint;expect(matchPhotoMissions(night,'none','none',false)).toContain('onari-night');expect(matchPhotoMissions({...night,atmosphere:{time:'day',season:'summer'}},'none','none',false)).not.toContain('onari-night');expect(matchPhotoMissions({...night,target:[145,62,-1300]},'none','none',false)).not.toContain('onari-night');
  expect(matchPhotoMissions(VIEWS['city-hall'].view,'wave','none',true)).toContain('cityhall-diver');expect(matchPhotoMissions(VIEWS['city-hall'].view,'none','none',true)).not.toContain('cityhall-diver');expect(matchPhotoMissions(VIEWS['harbor-life'].view,'wave','boat',true)).toContain('harbor-boat');expect(matchPhotoMissions(VIEWS['harbor-life'].view,'wave','none',true)).not.toContain('harbor-boat');
 });
 it('stores known achievements separately and reports storage failure',()=>{const map=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>map.get(k),setItem:(k:string,v:string)=>map.set(k,v)});recordPhotoAchievements(['onari-night'],'https://example.com/#/view');expect(loadPhotoAchievements()['onari-night']).toBeDefined();expect([...map.keys()]).toEqual([PHOTO_MISSION_KEY]);map.set(PHOTO_MISSION_KEY,'{"fake":{},"onari-night":{"at":"bad","link":1}}');expect(loadPhotoAchievements()).toEqual({});vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw Error();}});expect(recordPhotoAchievements(['onari-night'],'x').saved).toBe(false);});
});
