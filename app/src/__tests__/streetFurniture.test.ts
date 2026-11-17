import {afterEach,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {streamStreetFurniture} from '../features/exploration/map/three/streetFurniture';
const chunk={id:'frn--1',url:'frn--1.glb',min:[-10,40,-20],max:[10,50,20],draws:2};
afterEach(()=>vi.unstubAllGlobals());
async function setup(){vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({chunks:[chunk]})})));const scene=new THREE.Scene();const group=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();group.add(new THREE.Mesh(geometry,material));const loadAsync=vi.fn(async()=>({scene:group}));const stream=streamStreetFurniture(scene,{loadAsync} as never,'/assets/');await stream.ready;return{scene,stream,group,geometry,loadAsync};}
it('does not load furniture above town, then shows it nearby and releases it beyond the retention radius',async()=>{
 const {stream,group,geometry,loadAsync}=await setup(),release=vi.spyOn(geometry,'dispose');
 stream.update(new THREE.Vector3(0,300,0),1000);expect(loadAsync).not.toHaveBeenCalled();
 stream.update(new THREE.Vector3(0,48,0),2000);await Promise.resolve();expect(loadAsync).toHaveBeenCalledOnce();
 stream.update(new THREE.Vector3(0,48,0),3000);expect(group.visible).toBe(true);
 stream.update(new THREE.Vector3(1000,48,0),4000);expect(release).toHaveBeenCalledOnce();expect(stream.loadedCount()).toBe(0);stream.dispose();
});
it('releases a model that completes after leaving the scene',async()=>{
 const {stream,geometry,group,loadAsync}=await setup();let finish!:(g:{scene:THREE.Group})=>void;loadAsync.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const release=vi.spyOn(geometry,'dispose');stream.update(new THREE.Vector3(0,48,0),1000);stream.dispose();finish({scene:group});await Promise.resolve();expect(release).toHaveBeenCalledOnce();expect(group.parent).toBeNull();
});
