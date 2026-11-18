import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import catalog from '../../../../../data/fish.json';
import { getFishVisual, type FishShapeType } from '../../../../data/fishPlaceholders';
import { getFishDisplayName } from '../../../../lib/i18n';
import type { FishRecord } from '../../../../types/schema';
import type { Locale } from '../../../../config/appConfig';
import type { HidingPlace } from '../../domain';
import {huntKind,fishMotion} from '../../huntRules';
import { FISH_SITES, targetGlow } from '../../fishWorld';

/** Stylized shared meshes: no photos, 24 rigged skeletons, shadow maps or bloom passes. */
function bodyGeometry(shape:FishShapeType){
 const parts:THREE.BufferGeometry[]=[];
 function ellipsoid(x:number,y:number,z:number,sx:number,sy:number,sz:number){const g=new THREE.SphereGeometry(1,12,8);g.scale(sx,sy,sz);g.translate(x,y,z);parts.push(g);}
 function limb(a:THREE.Vector3,b:THREE.Vector3,r=.045){const g=new THREE.CylinderGeometry(r,r,b.distanceTo(a),5);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());parts.push(g);}
 function fin(x:number,y:number,z:number,sx:number,sy:number,sz:number){const g=new THREE.ConeGeometry(1,1,3);g.scale(sx,sy,sz);g.translate(x,y,z);parts.push(g);}
 if(shape==='crab'){
  ellipsoid(0,0,0,.65,.28,.5);
  for(const side of [-1,1])for(let i=0;i<4;i++){
   const a=new THREE.Vector3(.45-i*.3,-.05,side*.35),b=new THREE.Vector3(.8-i*.5,-.05,side*(.9+(i%2)*.12)),c=new THREE.Vector3(1-i*.65,-.55,side*1.25);
   limb(a,b);limb(b,c);
  }
 }else if(shape==='octopus'){
  ellipsoid(0,.2,0,.6,.65,.55);ellipsoid(-.45,.65,0,.35,.16,.25);ellipsoid(.45,.65,0,.35,.16,.25);
  for(let i=0;i<8;i++){const angle=i*Math.PI/4;limb(new THREE.Vector3(0,-.2,0),new THREE.Vector3(Math.cos(angle)*.9,-.65,Math.sin(angle)*.85),.1);}
 }else if(shape==='shrimp'){
  for(let i=0;i<6;i++)ellipsoid(.7-i*.28,Math.sin(i*.45)*.16,0,.25-i*.018,.28-i*.022,.22-i*.018);
  for(let i=0;i<5;i++)for(const s of [-1,1])limb(new THREE.Vector3(.6-i*.27,-.12,s*.12),new THREE.Vector3(.4-i*.27,-.5,s*.35),.025);
  for(const s of [-1,1])limb(new THREE.Vector3(.8,.15,s*.1),new THREE.Vector3(1.7,.45,s*.35),.02);
 }else if(shape==='isopod'){
  for(let i=0;i<7;i++){ellipsoid(.65-i*.22,0,0,.19,.27,.4);for(const s of [-1,1])limb(new THREE.Vector3(.65-i*.22,-.1,s*.25),new THREE.Vector3(.55-i*.22,-.4,s*.6),.035);}
 }else{
  const eel=shape==='eel',shark=shape==='shark',angler=shape==='angler';
  ellipsoid(0,0,0,eel?1.6:1,angler?.55:eel?.16:.43,angler?.48:eel?.16:.3);
  if(shark){fin(0,.55,0,.35,.7,.1);for(const s of [-1,1])ellipsoid(.15,-.1,s*.5,.5,.08,.5);}
  else if(!eel){fin(-.1,.45,0,.45,.35,.06);for(const s of [-1,1])ellipsoid(0,-.1,s*.3,.3,.06,.24);}
  if(angler){limb(new THREE.Vector3(.5,.35,0),new THREE.Vector3(.85,.95,0),.025);ellipsoid(.9,.95,0,.1,.1,.1);}
 }
 const result=mergeGeometries(parts);parts.forEach(g=>g.dispose());result.computeBoundingSphere();return result;
}
function glowTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!;const gradient=ctx.createRadialGradient(64,64,2,64,64,64);gradient.addColorStop(0,'rgba(255,244,180,.9)');gradient.addColorStop(.25,'rgba(255,182,65,.5)');gradient.addColorStop(1,'rgba(255,170,60,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(canvas);}
function labelTexture(text:string){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=80;const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgba(8,30,44,.85)';ctx.fillRect(0,0,512,80);ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff4db';ctx.fillText(text,256,40,490);return new THREE.CanvasTexture(canvas);}

export function createWorldFish(scene:THREE.Scene,targetFishId:string|undefined,target:HidingPlace,locale:Locale){
 const root=new THREE.Group();root.name='world-fish';scene.add(root);
 const geometries=new Map<FishShapeType,THREE.BufferGeometry>(),textures:THREE.Texture[]=[];
 const eyeGeometry=new THREE.SphereGeometry(.1,8,6),eyeMaterial=new THREE.MeshBasicMaterial({color:0x10202b});
 const tailGeometry=new THREE.ConeGeometry(.5,1,3);tailGeometry.rotateZ(-Math.PI/2);
 const fish=(catalog.fish as FishRecord[]).map((record,index)=>{
  const site=FISH_SITES.find(s=>s.fishId===record.id)!;
  const visual=getFishVisual(record.id);let geometry=geometries.get(visual.shape);if(!geometry){geometry=bodyGeometry(visual.shape);geometries.set(visual.shape,geometry);}
  const material=new THREE.MeshStandardMaterial({color:visual.accentColor,roughness:.65,metalness:.05,emissive:visual.accentColor,emissiveIntensity:.06});
  const group=new THREE.Group();group.name=`world-fish-${record.id}`;group.userData.fishId=record.id;
  const body=new THREE.Mesh(geometry,material);group.add(body);
  const eyes=new THREE.Group();for(const s of [-1,1]){const eye=new THREE.Mesh(eyeGeometry,eyeMaterial);eye.position.set(.65,.15,s*.27);eyes.add(eye);}group.add(eyes);
  const tail=new THREE.Mesh(tailGeometry,material);tail.position.x=-1.15;if(visual.shape==='shrimp')tail.scale.set(.5,.5,.35);tail.visible=!['crab','octopus','isopod'].includes(visual.shape);group.add(tail);
  group.scale.setScalar(3);group.traverse(o=>{o.userData.worldFish=true;});root.add(group);
  if(huntKind(record.id)==='school')for(const side of [-1,1]){const companion=new THREE.Mesh(geometry,material);companion.scale.setScalar(.65);companion.position.set(-1.8,.3,side*.9);companion.userData.worldFish=true;group.add(companion);}
  const origin=record.id===targetFishId?{...site,...target,y:target.y??85}:site;
  return {record,index,group,material,tail,origin,label:undefined as THREE.Sprite|undefined};
 });
 const texture=glowTexture();textures.push(texture);
 const glowMaterial=new THREE.SpriteMaterial({map:texture,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:true});
 const glow=new THREE.Sprite(glowMaterial);glow.name='today-fish-glow';glow.userData.worldFish=true;root.add(glow);
 const current=new THREE.Vector3(target.x,target.y??85,target.z);
 let disposed=false;
 return {
  root,targetPosition:current,
  update(time:number,viewer:THREE.Vector3,discovered:boolean,reducedMotion=false,options={night:true,light:false,aim:1}){
   if(disposed)return;
   for(const item of fish){
    const motion=fishMotion(item.record.id,item.index,time,reducedMotion);
    item.group.position.set(item.origin.x+motion.x,item.origin.y+motion.y,item.origin.z+motion.z);item.group.rotation.y=motion.yaw;
    item.tail.rotation.y=reducedMotion?0:Math.sin(time*3+item.index)*.25;
    const distance=viewer.distanceTo(item.group.position);item.group.visible=distance<240&&(huntKind(item.record.id)!=='night'||options.night||item.record.id===targetFishId&&discovered);
    const isTarget=item.record.id===targetFishId;
    const lit=huntKind(item.record.id)!=='light'||options.light&&options.aim>.78;
    const strength=isTarget&&item.group.visible&&lit?targetGlow(distance)*(discovered?.3:1):0;
    item.material.emissiveIntensity=.06+strength*.75;
    if(isTarget){current.copy(item.group.position);glow.position.copy(current);glow.visible=strength>0;glow.scale.setScalar(12+(reducedMotion?0:Math.sin(time*3))*.7);glowMaterial.opacity=strength*.55;glow.userData.strength=strength;}
    if(distance<25&&!item.label){const map=labelTexture(getFishDisplayName(item.record,locale));textures.push(map);item.label=new THREE.Sprite(new THREE.SpriteMaterial({map,depthWrite:false,fog:true}));item.label.scale.set(3.6,.6,1);item.label.position.y=2;item.label.userData.worldFish=true;item.group.add(item.label);}
    if(item.label)item.label.visible=distance<25;
   }
  },
  dispose(){disposed=true;scene.remove(root);geometries.forEach(g=>g.dispose());eyeGeometry.dispose();tailGeometry.dispose();eyeMaterial.dispose();fish.forEach(f=>{f.material.dispose();f.label?.material.dispose();});glowMaterial.dispose();textures.forEach(t=>t.dispose());},
 };
}
