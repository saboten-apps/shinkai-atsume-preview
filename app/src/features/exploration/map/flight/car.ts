import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** Small open-top harbor car. Three draws, including four instanced wheels. */
export function createCar(){
 const root=new THREE.Group();root.name='personal-car';root.visible=false;
 const parts:THREE.BufferGeometry[]=[];
 const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);parts.push(g);};
 box(1.35,.38,2.05,0,.46,0);box(1.25,.16,.65,0,.72,-.65);box(1.25,.22,.35,0,.73,.81);
 box(.12,.45,1.1,-.62,.8,.12);box(.12,.45,1.1,.62,.8,.12);
 const body=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());root.add(new THREE.Mesh(body,new THREE.MeshStandardMaterial({color:0x529da7,roughness:.65})));
 const glass=new THREE.BoxGeometry(1.13,.38,.05);glass.translate(0,.98,-.42);root.add(new THREE.Mesh(glass,new THREE.MeshStandardMaterial({color:0x233c4d,roughness:.3,metalness:.15})));
 const wheels=new THREE.InstancedMesh(new THREE.CylinderGeometry(.25,.25,.18,12),new THREE.MeshStandardMaterial({color:0x23323b,roughness:.95}),4);
 wheels.instanceMatrix.setUsage(THREE.DynamicDrawUsage);const dummy=new THREE.Object3D();let angle=0;
 function update(dt:number,speed:number){angle=(angle+Math.abs(speed)*dt/.25)%(Math.PI*2);let i=0;for(const x of [-.67,.67])for(const z of [-.65,.65]){dummy.position.set(x,.25,z);dummy.rotation.set(angle,0,Math.PI/2);dummy.updateMatrix();wheels.setMatrixAt(i++,dummy.matrix);}wheels.instanceMatrix.needsUpdate=true;}
 update(0,0);root.add(wheels);return{root,update};
}
