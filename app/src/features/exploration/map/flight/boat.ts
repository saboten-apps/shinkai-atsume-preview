import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
export function boatFitsWater(isWater:(x:number,z:number)=>boolean,x:number,z:number){return [[0,0],[-1.3,0],[1.3,0],[0,-1.3],[0,1.3]].every(([a,b])=>isWater(x+a,z+b));}
export function cruisePath(isWater:(x:number,z:number)=>boolean,x:number,z:number){
 for(const radius of [18,10,5]){const points=Array.from({length:32},(_,i)=>({x:x+Math.sin(i*Math.PI/16)*radius,z:z+Math.cos(i*Math.PI/16)*radius*.7}));if(points.every((p,i)=>{const next=points[(i+1)%points.length],steps=Math.ceil(Math.hypot(next.x-p.x,next.z-p.z)/.5);return Array.from({length:steps+1},(_,j)=>boatFitsWater(isWater,p.x+(next.x-p.x)*j/steps,p.z+(next.z-p.z)*j/steps)).every(Boolean);}))return points;}
 return null;
}
export function createBoat(){
 const root=new THREE.Group();root.name='personal-boat';root.visible=false;
 const body=new THREE.SphereGeometry(1,16,8);body.scale(.9,.32,1.4);body.translate(0,.04,0);
 const edge=new THREE.BoxGeometry(1.55,.16,2.1);edge.translate(0,.23,.05);const g=mergeGeometries([body,edge])!;body.dispose();edge.dispose();root.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xe0a75a,roughness:.75})));
 const seat=new THREE.Mesh(new THREE.BoxGeometry(1.2,.15,.45),new THREE.MeshStandardMaterial({color:0xf0e4cb,roughness:.8}));seat.position.set(0,.43,.3);root.add(seat);
 const motor=new THREE.Mesh(new THREE.BoxGeometry(.35,.7,.35),new THREE.MeshStandardMaterial({color:0x37505e,roughness:.65}));motor.position.set(0,.2,1.15);root.add(motor);return{root};
}
