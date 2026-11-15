import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import data from '../../cityStructures.v1.json';
import {addPhotoSurfaceDetail} from './surfaceDetail';

/** GSI centerlines with lightweight modeled decks, footways, rails and supports. */
export function createCityStructures(scene:THREE.Scene,ground:THREE.Group,roads:THREE.Group,addCollider?:(g:THREE.Group)=>(()=>void)|void){
 const root=new THREE.Group();root.name='city-bridges';scene.add(root);ground.updateMatrixWorld(true);roads.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
 const height=(x:number,z:number)=>{ray.set(new THREE.Vector3(x,160,z),down);return ray.intersectObjects([ground,roads],true)[0]?.point.y??42;};
 const materials=[new THREE.MeshStandardMaterial({color:0x484e52,roughness:.96}),new THREE.MeshStandardMaterial({color:0xb1b2ad,roughness:.9}),new THREE.MeshStandardMaterial({color:0x7e9896,roughness:.55,metalness:.35}),new THREE.MeshStandardMaterial({color:0xf0e9c9,roughness:.85})];
 materials[0].onBeforeCompile=shader=>addPhotoSurfaceDetail(shader,'ground');materials[0].customProgramCacheKey=()=> 'bridge-asphalt-detail-v1';
 const colliders:Array<()=>void>=[],deckHeights=new Map<string,number>();
 for(const bridge of data.bridges){
  const dx=bridge.b.x-bridge.a.x,dz=bridge.b.z-bridge.a.z,length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
  const ya=height(bridge.a.x,bridge.a.z),yb=height(bridge.b.x,bridge.b.z),deckY=Math.max(44.5,ya+.65,yb+.65);
  deckHeights.set(bridge.id,deckY);
  const group=new THREE.Group();group.name=`bridge-${bridge.id}`;group.position.set(bridge.center.x,0,bridge.center.z);group.rotation.y=-Math.atan2(dz,dx);group.userData.bridgeId=bridge.id;group.userData.deckY=deckY;
  const parts:THREE.BufferGeometry[][]=[[],[],[],[]],collision:THREE.BufferGeometry[]=[];
  function box(material:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,solid=false){const g=new THREE.BoxGeometry(sx,sy,sz);g.translate(x,y,z);parts[material].push(g);if(solid)collision.push(g.clone());}
  function bar(x1:number,y1:number,z1:number,x2:number,y2:number,z2:number,r=.065){const a=new THREE.Vector3(x1,y1,z1),b=new THREE.Vector3(x2,y2,z2);const g=new THREE.CylinderGeometry(r,r,b.distanceTo(a),6);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize()));g.translate(...a.add(b).multiplyScalar(.5).toArray());parts[2].push(g);}
  box(1,0,deckY-.6,0,length,1.2,bridge.width,true);box(0,0,deckY+.025,0,length,.05,bridge.width-3.2);
  for(const side of [-1,1]){
   const z=side*(bridge.width/2-.8);box(1,0,deckY+.12,z,length,.24,1.6,true);
   box(2,0,deckY-1.3,side*(bridge.width/2-1.4),length,1,.45);
   for(const h of [.65,1.25])bar(-length/2,deckY+h,side*(bridge.width/2-.2),length/2,deckY+h,side*(bridge.width/2-.2));
   for(let x=-length/2;x<=length/2;x+=4)bar(x,deckY,side*(bridge.width/2-.2),x,deckY+1.25,side*(bridge.width/2-.2));
   box(3,0,deckY+.06,side*(bridge.width/2-1.9),length,.02,.12);
  }
  for(let x=-length/2+3;x<length/2-3;x+=9)box(3,x,deckY+.065,0,4,.02,.12);
  for(const t of [-.25,0,.25]){
   box(1,length*t,deckY-1.8,0,2.8,1,bridge.width-2);
   for(const side of [-1,1])box(1,length*t,(deckY-2+28)/2,side*(bridge.width/2-2.5),2.3,deckY-2-28,2.3,true);
  }
  // Short approaches connect the raised deck to the source road at each bank.
  for(const side of [-1,1]){
   const end=side===-1?bridge.a:bridge.b,outerY=height(end.x+side*ux*18,end.z+side*uz*18)+.05;
   const x=side*(length/2+9),slope=Math.atan2((outerY-deckY)*side,18);
   const g=new THREE.BoxGeometry(Math.hypot(18,outerY-deckY),.45,bridge.width);g.rotateZ(slope);g.translate(x,(outerY+deckY)/2-.225,0);parts[0].push(g);collision.push(g.clone());
  }
  parts.forEach((list,index)=>{if(!list.length)return;const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,materials[index]);mesh.userData.cityBridge=true;group.add(mesh);});
  root.add(group);group.updateMatrixWorld(true);
  const collider=new THREE.Group();collider.position.copy(group.position);collider.rotation.copy(group.rotation);const geometry=mergeGeometries(collision);collision.forEach(g=>g.dispose());const material=new THREE.MeshBasicMaterial();collider.add(new THREE.Mesh(geometry,material));
  const remove=addCollider?.(collider);if(remove)colliders.push(remove);geometry.dispose();material.dispose();
 }
 return {root,deckHeights,dispose(){colliders.forEach(fn=>fn());scene.remove(root);root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});materials.forEach(m=>m.dispose());}};
}
