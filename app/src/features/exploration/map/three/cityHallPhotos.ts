import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point=readonly [number,number];
export type PhotoQuad=readonly [Point,Point,Point,Point]; // TL,TR,BR,BL, image coordinates (top-down)
/** Square-to-quad homography: no generated pixels and no diagonal UV seam. */
export function photoProjection(q:PhotoQuad){
 const [a,b,c,d]=q,dx1=b[0]-c[0],dx2=d[0]-c[0],dx3=a[0]-b[0]+c[0]-d[0],dy1=b[1]-c[1],dy2=d[1]-c[1],dy3=a[1]-b[1]+c[1]-d[1];
 const determinant=dx1*dy2-dx2*dy1;
 if(Math.abs(determinant)<1e-10)throw new Error('Degenerate photo projection');
 const g=(dx3*dy2-dx2*dy3)/determinant,h=(dx1*dy3-dx3*dy1)/determinant;
 return (u:number,v:number):Point=>{
  const denominator=g*u+h*v+1;
  return [((b[0]-a[0]+g*b[0])*u+(d[0]-a[0]+h*d[0])*v+a[0])/denominator,((b[1]-a[1]+g*b[1])*u+(d[1]-a[1]+h*d[1])*v+a[1])/denominator];
 };
}
const normalized=(pixels:PhotoQuad):PhotoQuad=>pixels.map(([x,y])=>[x/1280,y/720] as Point) as unknown as PhotoQuad;
const WINDOW=normalized([[500,219],[682,246],[685,324],[501,299]]);
const DOOR=normalized([[422,352],[800,350],[800,412],[422,414]]);
const TILE=normalized([[99,23],[201,20],[202,325],[99,322]]);
const CONCRETE:PhotoQuad=[[.38,.12],[.66,.17],[.65,.28],[.39,.25]];
const SOURCES=[
 {name:'facade.jpg',crop:[495/1280,210/720,700/1280,335/720],size:[1024,512]},
 {name:'entrance.jpg',crop:[.325,.48,.633,.58],size:[1024,256]},
 {name:'entrance.jpg',crop:[.075,.02,.16,.46],size:[256,1024]},
 {name:'concrete.jpg',crop:[.37,.11,.67,.29],size:[1024,512]},
] as const;

/** Source photos are requested only near City Hall, decoded sequentially and
 * cropped/decoded to the used photo regions before upload (<9 MiB with mips).
 */
export function createCityHallPhotos(root:THREE.Group){
 const photos=new THREE.Group();photos.name='city-hall-photographs';root.add(photos);photos.visible=false;
 let disposed=false,active=false,generation=0,retryAt=0,pending:Promise<void>=Promise.resolve(),abort:AbortController|undefined;
 const materials:THREE.MeshStandardMaterial[]=[],textures:THREE.Texture[]=[],bitmaps:ImageBitmap[]=[];
 function clear(){photos.children.forEach(o=>{(o as THREE.Mesh).geometry.dispose();});photos.clear();materials.splice(0).forEach(m=>m.dispose());textures.splice(0).forEach(t=>t.dispose());bitmaps.splice(0).forEach(b=>b.close());root.userData.photoTextures=0;}
 function release(){generation++;abort?.abort();active=false;photos.visible=false;clear();root.userData.photoState='idle';}
 async function load(version:number){
  const controller=new AbortController();abort=controller;const signal=controller.signal;
  const timeout=setTimeout(()=>controller.abort(),30000);root.userData.photoState='loading';
  try{
   const blobs=new Map<string,Blob>();
   for(const {name,crop,size} of SOURCES){
    let blob=blobs.get(name);
    if(!blob){const response=await fetch(`${import.meta.env.BASE_URL}environment/city-hall/${name}`,{signal});if(!response.ok)throw new Error(`City hall photo ${response.status}`);blob=await response.blob();blobs.set(name,blob);}
    if(disposed||version!==generation)return;
    const [left,top,right,bottom]=crop;
    const bitmap=await createImageBitmap(blob,Math.floor(left*4032),Math.floor(top*2268),Math.ceil((right-left)*4032),Math.ceil((bottom-top)*2268),{resizeWidth:size[0],resizeHeight:size[1],resizeQuality:'high',imageOrientation:'flipY'});
    if(disposed||version!==generation){bitmap.close();return;}
    if(signal.aborted){bitmap.close();throw new Error('City hall photo timed out');}
    const texture=new THREE.Texture(bitmap);texture.name=`city-hall-${name}`;texture.flipY=false;texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;texture.needsUpdate=true;
    textures.push(texture);bitmaps.push(bitmap);
   }
   if(disposed||version!==generation)return;
   const batches=new Map<number,THREE.BufferGeometry[]>();
   function panel(asset:number,quad:PhotoQuad,w:number,h:number,position:THREE.Vector3,rotation:THREE.Euler){
    const geometry=new THREE.PlaneGeometry(w,h,4,4),uv=geometry.getAttribute('uv'),project=photoProjection(quad);
    const [left,top,right,bottom]=SOURCES[asset].crop;
    for(let i=0;i<uv.count;i++){const [x,y]=project(uv.getX(i),1-uv.getY(i));uv.setXY(i,(x-left)/(right-left),1-(y-top)/(bottom-top));}
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));geometry.translate(position.x,position.y,position.z);
    const list=batches.get(asset)??[];list.push(geometry);batches.set(asset,list);
   }
   function facade(w:number,center:THREE.Vector3,angle:number){
    const bays=3,local=new THREE.Vector3(),rotation=new THREE.Euler(0,angle,0),matrix=new THREE.Matrix4().makeRotationFromEuler(rotation);
    for(let floor=0;floor<9;floor++)for(let bay=0;bay<bays;bay++){
     local.set(-w/2+(bay+.5)*w/bays,(floor+.5)*4.8,.405).applyMatrix4(matrix).add(center);
     panel(0,WINDOW,w/bays,4.8,local,rotation);
    }
   }
   facade(36.2,new THREE.Vector3(13.94,0,-1.4),Math.PI/2);
   facade(36.2,new THREE.Vector3(-20.84,0,-1.4),-Math.PI/2);
   facade(34.7,new THREE.Vector3(-3.45,0,16.74),0);
   facade(34.7,new THREE.Vector3(-3.45,0,-19.54),Math.PI);
   panel(1,DOOR,30,4.2,new THREE.Vector3(-8,2.5,25.47),new THREE.Euler());
   for(const x of [-28,12])for(const z of [27,39]){
    for(const [dx,dz,angle] of [[0,1.356,0],[1.356,0,Math.PI/2],[0,-1.356,Math.PI],[-1.356,0,-Math.PI/2]])
     panel(2,TILE,2.7,6.3,new THREE.Vector3(x+dx,3.85,z+dz),new THREE.Euler(0,angle,0));
   }
   // Small repeating concrete patches cover only the roof underside. Columns,
   // beams and ceiling remain actual geometry; no background scenery is pasted.
   for(let x=0;x<6;x++)for(let z=0;z<3;z++)panel(3,CONCRETE,43.3/6,16.5/3,new THREE.Vector3(-7.8-43.3/2+(x+.5)*43.3/6,6.765,33.1-16.5/2+(z+.5)*16.5/3),new THREE.Euler(Math.PI/2,0,0));
   for(const [asset,parts] of batches){
    const geometry=mergeGeometries(parts)!;parts.forEach(g=>g.dispose());
    const material=new THREE.MeshStandardMaterial({map:textures[asset],emissiveMap:textures[asset],emissive:0xffffff,emissiveIntensity:.15,roughness:.86,metalness:0});materials.push(material);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`city-hall-photo-${asset}`;photos.add(mesh);
   }
   root.userData.photoTextures=textures.length;root.userData.photoState='ready';photos.visible=active;
  }catch(error){if(disposed||version!==generation)return;clear();root.userData.photoState='failed';retryAt=performance.now()+60000;console.warn('City hall photographs unavailable:',error);}finally{clearTimeout(timeout);}
 }
 const center=new THREE.Vector3();
 return {
  update(viewer:THREE.Vector3){
   if(disposed||typeof window==='undefined')return;
   root.getWorldPosition(center);const near=Math.hypot(viewer.x-center.x,viewer.z-center.z)<(active?270:210);
   if(!near){if(active)release();return;}
   active=true;
   if(!textures.length&&root.userData.photoState!=='loading'&&performance.now()>=retryAt)pending=load(++generation);
   photos.visible=root.userData.photoState==='ready';
  },
  settled:()=>pending,
  dispose(){if(disposed)return;disposed=true;release();photos.removeFromParent();},
 };
}
