import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import catalog from '../../data/fish.json';
import {FISH_SITES,FISH_WORLD_VERSION,fishWorldSession,targetGlow} from '../features/exploration/fishWorld';
import {BOUNDS,dailyPlace,EXPLORATION_KEY,HIDE_VERSION,saveDiscovery} from '../features/exploration/domain';
import {drawDailyFish} from '../lib/gacha';
import type {FishRecord} from '../types/schema';
afterEach(()=>vi.unstubAllGlobals());
function storage(){const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>data.set(key,value)});return data;}
describe('fish in virtual Numazu',()=>{
 it('places every catalog fish once within the playable bounds and includes sea, river and sky',()=>{
  expect(FISH_SITES.map(p=>p.fishId).sort()).toEqual(catalog.fish.map(f=>f.id).sort());
  expect(new Set(FISH_SITES.map(p=>`${p.x}/${p.z}`)).size).toBe(24);
  for(const p of FISH_SITES){expect(p.x).toBeGreaterThanOrEqual(BOUNDS.minX);expect(p.x).toBeLessThanOrEqual(BOUNDS.maxX);expect(p.z).toBeGreaterThanOrEqual(BOUNDS.minZ);expect(p.z).toBeLessThanOrEqual(BOUNDS.maxZ);expect(p.y).toBeGreaterThan(29);if(p.medium!=='air')expect(p.y).toBeLessThan(39);}
  expect(new Set(FISH_SITES.map(p=>p.medium))).toEqual(new Set(['sea','river','air']));
 });
 it('uses the unchanged daily draw to select one shared world fish, and saves under a new version',()=>{
  storage();const date='2026-11-15',fish=drawDailyFish(date,catalog.fish as FishRecord[]).fish;
  const hunt=fishWorldSession(date,fish.id);expect(hunt.place.id).toBe(`fish-world-${fish.id}`);expect(hunt.version).toBe(FISH_WORLD_VERSION);
  const record={date,fishId:fish.id,placeId:hunt.place.id,version:hunt.version,mode:'2d' as const,foundAt:'saved'};
  saveDiscovery(record);expect(fishWorldSession(date,fish.id).found).toEqual(record);
 });
 it('keeps legacy discoveries, original places, versions and storage unchanged',()=>{
  const data=storage(),date='2026-11-15',fishId='f11',place=dailyPlace(date);
  const old={date,fishId,placeId:place.id,version:HIDE_VERSION,mode:'3d' as const,foundAt:'original'};
  saveDiscovery(old);const before=data.get(EXPLORATION_KEY);
  expect(fishWorldSession(date,fishId)).toEqual({place,version:HIDE_VERSION,found:old});
  expect(data.get(EXPLORATION_KEY)).toBe(before);
 });
 it('has no distant beacon and increases glow only as the viewer approaches',()=>{
  expect(targetGlow(1000)).toBe(0);expect(targetGlow(90)).toBe(0);expect(targetGlow(65)).toBeLessThan(targetGlow(40));expect(targetGlow(0)).toBe(1);
 });
});

it('ships a validated real-scenery postcard for every new fish site',()=>{
 const report=JSON.parse(readFileSync(new URL('../../public/map/cards/fish-world-validation.json',import.meta.url),'utf8'));
 expect(report.places).toHaveLength(24);
 for(const site of FISH_SITES){
  const checked=report.places.find((p:{id:string})=>p.id===site.id);
  expect(checked).toMatchObject({x:site.x,z:site.z,status:''});expect(checked.photoTiles).toBeGreaterThan(0);
  const photo=readFileSync(new URL(`../../public/map/cards/${site.id}.webp`,import.meta.url));
  expect(photo.subarray(0,4).toString()).toBe('RIFF');expect(photo.subarray(8,12).toString()).toBe('WEBP');expect(photo.length).toBeGreaterThan(10000);
 }
});
