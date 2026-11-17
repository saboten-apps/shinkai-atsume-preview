import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** Photo-informed tied-arch silhouette. Width, rise and ribs are approximations,
 * not a bridge survey. Keep the existing GSI deck endpoints and height. */
export function createOnariArch(length:number,width:number,deckY:number){
 const root=new THREE.Group();root.name='onari-photo-reference-arch';root.userData.photoReferenceModel=true;
 const steel=new THREE.MeshStandardMaterial({color:0x9eafa5,roughness:.72,metalness:.2});
 const blue=new THREE.MeshBasicMaterial({color:0x389bff,transparent:true,opacity:0,depthWrite:false,toneMapped:false});blue.userData.nightLight=true;blue.userData.nightOnly=true;
 const parts:THREE.BufferGeometry[]=[],lights:THREE.BufferGeometry[]=[];
 const span=length*.72,rise=span*.16,halfWidth=width/2-.55;
 const arch=(t:number,z:number)=>new THREE.Vector3((t-.5)*span,deckY+.7+4*rise*t*(1-t),z);
 function beam(list:THREE.BufferGeometry[],a:THREE.Vector3,b:THREE.Vector3,w:number,d:number){const g=new THREE.BoxGeometry(w,a.distanceTo(b),d);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.clone().add(b).multiplyScalar(.5).toArray());list.push(g);}
 for(const side of [-1,1]){
  const z=side*halfWidth;
  for(let i=0;i<32;i++){
   const a=arch(i/32,z),b=arch((i+1)/32,z);beam(parts,a,b,.55,.5);
   beam(lights,a.clone().add(new THREE.Vector3(0,.28,side*.15)),b.clone().add(new THREE.Vector3(0,.28,side*.15)),.12,.12);
  }
  for(let i=1;i<20;i++){const a=arch(i/20,z);beam(parts,new THREE.Vector3(a.x,deckY+1.1,z),a,.12,.12);}
 }
 for(let i=4;i<=28;i+=4){const a=arch(i/32,-halfWidth),b=arch(i/32,halfWidth);beam(parts,a,b,.16,.16);}
 const geometry=mergeGeometries(parts)!,lightGeometry=mergeGeometries(lights)!;parts.forEach(g=>g.dispose());lights.forEach(g=>g.dispose());root.add(new THREE.Mesh(geometry,steel),new THREE.Mesh(lightGeometry,blue));
 let disposed=false;
 return{root,span,rise,dispose(){if(disposed)return;disposed=true;root.removeFromParent();geometry.dispose();lightGeometry.dispose();steel.dispose();blue.dispose();}};
}
