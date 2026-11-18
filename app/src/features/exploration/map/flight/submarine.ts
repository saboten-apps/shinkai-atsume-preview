import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
/** Tiny personal submersible: three meshes, no textures or dynamic lights. */
export function createSubmarine(){
 const root=new THREE.Group();root.name='personal-submarine';
 const body=new THREE.SphereGeometry(1,16,10);body.scale(.68,.37,1.04);body.translate(0,.32,-.08);
 const fin=new THREE.BoxGeometry(1.7,.08,.36);fin.translate(0,.28,.35);
 const tail=new THREE.BoxGeometry(.08,.65,.45);tail.translate(0,.46,.85);
 const merged=mergeGeometries([body,fin,tail])!;body.dispose();fin.dispose();tail.dispose();
 const hull=new THREE.Mesh(merged,new THREE.MeshStandardMaterial({color:0xe9b851,roughness:.65}));
 const glass=new THREE.Mesh(new THREE.SphereGeometry(.45,12,8),new THREE.MeshStandardMaterial({color:0x2c6876,roughness:.35,metalness:.15}));glass.scale.set(1,.7,.8);glass.position.set(0,.58,-.45);
 const propeller=new THREE.Mesh(new THREE.BoxGeometry(.8,.1,.06),new THREE.MeshStandardMaterial({color:0x395463,roughness:.65}));propeller.position.set(0,.32,1.03);
 root.add(hull,glass,propeller);root.visible=false;
 return{root,update(time:number,speed:number){propeller.rotation.z=time*(3+speed*2);}};
}
