import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** GSI road junction; dimensions and street furniture are photo-informed approximations.
 * No traffic simulation or statement of present-day traffic regulations. */
export const CITY_HALL_JUNCTION = {x:551.37,z:-1637.19};
export function createCityHallStreet(scene:THREE.Scene,roads:THREE.Group,ground:THREE.Group,addCollider?:(g:THREE.Group)=>(()=>void)|void){
 const root=new THREE.Group();root.name='city-hall-street-detail';root.userData.approximateStreet=true;
 const origin=CITY_HALL_JUNCTION;
 // Local X follows the main road southward; local Z follows the GSI west branch.
 const ux=.3353,uz=.9421;
 const world=(x:number,z:number)=>new THREE.Vector3(origin.x+ux*x-.9932*z,0,origin.z+uz*x+.1164*z);
 roads.updateMatrixWorld(true);ground.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
 const height=(x:number,z:number)=>{const p=world(x,z);ray.set(p.setY(150),down);return ray.intersectObject(roads,true)[0]?.point.y??ray.intersectObject(ground,true)[0]?.point.y??43.35;};
 const center=height(0,0),slopeX=(height(55,0)-height(-55,0))/110,slopeZ=(height(0,45)-height(0,-45))/90;
 const elevation=(x:number,z:number)=>center+slopeX*x+slopeZ*z;
 const materials=[
  new THREE.MeshBasicMaterial({color:0xf5f1df,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),
  new THREE.MeshBasicMaterial({color:0xe7a22e,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),
  new THREE.MeshStandardMaterial({color:0x8b9995,roughness:.7,metalness:.2}),
  new THREE.MeshStandardMaterial({color:0x35484d,roughness:.75}),
  new THREE.MeshBasicMaterial({color:0x44d6ac}),
  new THREE.MeshBasicMaterial({color:0xdd6655}),
  new THREE.MeshStandardMaterial({color:0x41657b,roughness:.65}),
  new THREE.MeshStandardMaterial({color:0xdedbd0,roughness:.85}),
 ];
 const batches=materials.map(()=>[] as THREE.BufferGeometry[]),solids:THREE.BufferGeometry[]=[];
 function box(slot:number,x:number,y:number,z:number,w:number,h:number,d:number,solid=false){
  const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y+elevation(x,z),z);batches[slot].push(g);if(solid)solids.push(g.clone());
 }
 // Markings remain geometry at close range instead of pixels in the aerial photo.
 for(const side of [-1,1]){
  const a=side*18;
  for(let z=-8;z<=8;z+=1.2)box(0,a,.07,z,3.6,.025,.55);
  for(let x=-5;x<=5;x+=1.2)box(0,x,.07,side*18,.55,.025,3.6);
  box(0,side*22,.07,side*4.2,.45,.025,8);
  box(0,side*3,.07,side*22,5.5,.025,.45);
  for(let x=27;x<85;x+=8){box(0,side*x,.07,side*4.2,4,.025,.15);}
  box(1,side*53,.07,0,60,.025,.16);
  box(0,side*53,.07,side*9.1,60,.025,.15);
  box(0,side*53,.07,-side*9.1,60,.025,.15);
  box(1,0,.07,side*47,.16,.025,48);
 }
 // Four compact poles, with no dynamic lights, shadows or blinking updates.
 for(const x of [-14,14])for(const z of [-13,13]){
  box(2,x,2.8,z,.16,5.6,.16);
  box(2,x,5.3,z-Math.sign(z)*2.3,.12,.12,4.6);
  box(3,x,5.05,z-Math.sign(z)*4.3,.55,.52,1.8);
  for(let i=0;i<3;i++)box(i===0?4:3,x-Math.sign(x)*.285,5.05,z-Math.sign(z)*(3.75+i*.55),.035,.32,.32);
  box(3,x,2.5,z,.48,.66,.32);
  box(5,x-Math.sign(x)*.25,2.55,z,.03,.27,.19);
 }
 // A lightweight pedestrian overpass; width, stairs and railings are interpreted,
 // not a surveyed reconstruction. Stairs remain walkable collision geometry.
 const bridgeX=38,deck=5.8;
 box(2,bridgeX,deck,0,2.5,.3,29,true);
 for(const z of [-14,14]){
  box(2,bridgeX,deck/2,z,.45,deck,.45,true);
  for(let i=0;i<29;i++)box(2,bridgeX+1.3+i*.29,deck-i*.2-.1,z,.30,.20,2.5,true);
  for(const side of [-1,1]){
   const rail=new THREE.BoxGeometry(Math.hypot(8.7,5.8),.07,.07);rail.rotateZ(-Math.atan2(5.8,8.7));rail.translate(bridgeX+5.65,elevation(bridgeX+5.65,z)+3.9,z+side*1.15);batches[2].push(rail);
   for(let i=0;i<9;i++)box(2,bridgeX+1.3+i,6.7-i*.69,z+side*1.15,.06,1,.06);
  }
 }
 for(const side of [-1,1]){
  box(2,bridgeX+side*1.14,deck+1,0,.08,.08,29);
  box(2,bridgeX+side*1.14,deck+.55,0,.06,.06,29);
  for(let z=-14;z<=14;z+=2)box(2,bridgeX+side*1.14,deck+.5,z,.06,1,.06);
 }
 // Two stationary, deliberately simple cars; no animation or vehicle physics.
 for(const [x,z,slot] of [[-4,37,6],[4,-37,7]]){
  box(slot,x,.7,z,1.7,.8,4);box(3,x,1.35,z,1.45,.6,2.05);
  box(slot,x,1.7,z,1.5,.10,2.1);
  for(const a of [-1,1])for(const b of [-1,1])box(3,x+a*.82,.35,z+b*1.25,.22,.58,.62);
 }
 // Match the junction's measured branch angle instead of assuming a right angle.
 const branchAlong=ux*(-.9932)+uz*.1164,branchAcross=(-uz)*(-.9932)+ux*.1164;
 const alignment=new THREE.Matrix4().set(1,0,branchAlong,0, 0,1,0,0, 0,0,branchAcross,0, 0,0,0,1);
 for(const parts of batches)for(const g of parts)g.applyMatrix4(alignment);
 for(const g of solids)g.applyMatrix4(alignment);
 root.position.set(origin.x,0,origin.z);root.rotation.y=-Math.atan2(uz,ux);
 batches.forEach((parts,i)=>{if(!parts.length)return;const geometry=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());root.add(new THREE.Mesh(geometry,materials[i]));});
 root.visible=false;scene.add(root);
 const collider=new THREE.Group();collider.position.copy(root.position);collider.rotation.copy(root.rotation);
 const collisionMaterial=new THREE.MeshBasicMaterial(),collisionGeometry=mergeGeometries(solids)!;solids.forEach(g=>g.dispose());collider.add(new THREE.Mesh(collisionGeometry,collisionMaterial));
 const remove=addCollider?.(collider);collisionGeometry.dispose();collisionMaterial.dispose();
 return{root,update(viewer:THREE.Vector3){const d=Math.hypot(viewer.x-origin.x,viewer.z-origin.z);root.visible=d<(root.visible?310:270)&&viewer.y<center+160;},dispose(){if(remove)remove();root.removeFromParent();root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});materials.forEach(m=>m.dispose());}};
}
