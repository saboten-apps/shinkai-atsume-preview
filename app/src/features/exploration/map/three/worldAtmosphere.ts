import * as THREE from 'three';
import {resolveAtmosphere,type AtmosphereChoice} from '../atmosphere';
import type {createPortSky} from './portSky';
export function createWorldAtmosphere(scene:THREE.Scene,sky:ReturnType<typeof createPortSky>,ambient:THREE.AmbientLight,sunLight:THREE.DirectionalLight,fill:THREE.DirectionalLight){
 const colors={top:new THREE.Color(),horizon:new THREE.Color(),cloud:new THREE.Color(),fog:new THREE.Color(),sun:new THREE.Color(),water:new THREE.Color(),night:0,density:.00035,sunPosition:new THREE.Vector3()};
 scene.userData.atmosphere=colors;
 const base=new WeakMap<THREE.Material,{color:THREE.Color;emissive:number}>();const temp=new THREE.Color();let next=0;
 let photo=1,leaf=0x243e2b;
 function applyMaterials(root:THREE.Object3D){
  const seen=new Set<THREE.Material>();
  root.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(const m of Array.isArray(o.material)?o.material:[o.material]){
   if(seen.has(m)||m.userData.atmosphereExempt)continue;seen.add(m);
   if(!(m instanceof THREE.MeshStandardMaterial||m instanceof THREE.MeshBasicMaterial))continue;
   let original=base.get(m);if(!original){original={color:m.color.clone(),emissive:m instanceof THREE.MeshStandardMaterial?m.emissiveIntensity:0};base.set(m,original);}
   m.color.copy(original.color);
   if(m.userData.seasonalFoliage)m.color.set(leaf);
   if(m.userData.nightOnly)m.opacity=colors.night;
   if(!m.userData.nightLight)m.color.multiplyScalar(m instanceof THREE.MeshBasicMaterial?photo:1-colors.night*.25);
   if(m instanceof THREE.MeshStandardMaterial)m.emissiveIntensity=original.emissive*(1-colors.night*.94);
   const haze=m.userData.regionalHazeUniform;if(haze)haze.value.copy(colors.fog);
  }});
 }
 const added=(event:{child:THREE.Object3D})=>applyMaterials(event.child);
 scene.addEventListener('childadded',added);
 return{update(choice:AtmosphereChoice,now:number,date=new Date(),force=false){
  if(!force&&now<next)return;next=now+1000;
  const p=resolveAtmosphere(choice,date),mix=p.mix,scalar=(key:'night'|'ambient'|'direct'|'fill'|'photo')=>THREE.MathUtils.lerp(p.a[key],p.b[key],mix);
  for(const key of ['top','horizon','cloud','fog','sun','water'] as const)colors[key].set(p.a[key]).lerp(temp.set(p.b[key]),mix);
  photo=scalar('photo');leaf=p.settings.leaf;
  colors.night=scalar('night');colors.density=p.settings.haze*(1+colors.night*.3);
  colors.sunPosition.set(Math.cos(p.sunAngle)*450,Math.max(20,Math.sin(p.sunAngle)*500),100);
  sky.setAtmosphere(colors);ambient.color.set(0xf5f0e6).lerp(temp.set(0xa4c6ed),colors.night);ambient.intensity=scalar('ambient');sunLight.color.copy(colors.sun);sunLight.intensity=scalar('direct');sunLight.position.copy(colors.sunPosition);fill.intensity=scalar('fill');
  applyMaterials(scene);
 },dispose(){scene.removeEventListener('childadded',added);delete scene.userData.atmosphere;}};
}
