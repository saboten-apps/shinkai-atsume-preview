import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addPhotoSurfaceDetail } from './surfaceDetail';
import { createCityHallPhotos } from './cityHallPhotos';

/** GSI label 138.86360943317413,35.09555689164136; geometry fitted to PLATEAU.
 * Dimensions below are game-space after the existing 1.3 height emphasis.
 * Surface colors/details are interpreted from the user's photos, not photo textures.
 */
export const CITY_HALL = {chunk:'station-5-2', x:548.5, z:-1567, y:43.35, rotation:.347};
export function cityHallPoint(x:number,y:number,z:number) {
  const c=Math.cos(CITY_HALL.rotation),s=Math.sin(CITY_HALL.rotation);
  return new THREE.Vector3(CITY_HALL.x+c*x+s*z,CITY_HALL.y+y,CITY_HALL.z-s*x+c*z);
}

/** Remove only the two connected source components, including UV seams.
 * Preserve draw groups/material assignments of every unrelated building.
 */
export function removeCityHallSource(group:THREE.Group) {
  group.updateMatrixWorld(true);
  const meshes:THREE.Mesh[]=[],points:THREE.Vector3[]=[],parent:number[]=[],offsets:number[]=[];
  const columns=new Map<string,number>();
  const find=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const join=(a:number,b:number)=>{a=find(a);b=find(b);parent[b]=a;};
  group.traverse(o=>{if(o instanceof THREE.Mesh)meshes.push(o);});
  for(const mesh of meshes){
    offsets.push(points.length);const off=points.length,p=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
    for(let i=0;i<p.count;i++){
      const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),id=points.length;
      points.push(v);parent.push(id);const key=`${Math.round(v.x*20)},${Math.round(v.z*20)}`,other=columns.get(key);
      if(other===undefined)columns.set(key,id);else join(id,other);
    }
    for(let i=0;i<(index?.count??p.count);i+=3){const ids=[0,1,2].map(j=>off+(index?index.getX(i+j):i+j));join(ids[0],ids[1]);join(ids[0],ids[2]);}
  }
  const bounds=new Map<number,THREE.Box3>();
  points.forEach((p,i)=>{const id=find(i);let box=bounds.get(id);if(!box){box=new THREE.Box3();bounds.set(id,box);}box.expandByPoint(p);});
  const seeds=[new THREE.Vector3(548,80,-1565),new THREE.Vector3(550,48,-1532)];
  const targets=new Set<number>();
  for(const seed of seeds){
    const candidates=[...bounds].filter(([,b])=>b.containsPoint(seed)&&b.min.x>498&&b.max.x<578&&b.min.z> -1623&&b.max.z< -1516);
    // Fail closed: a changed dataset must not remove a neighboring building.
    if(candidates.length!==1)return {components:0,triangles:0};
    targets.add(candidates[0][0]);
  }
  if(targets.size!==2)return {components:0,triangles:0};
  let removed=0;
  meshes.forEach((mesh,m)=>{
    const geometry=mesh.geometry,index=geometry.index,p=geometry.getAttribute('position'),oldGroups=geometry.groups.length?geometry.groups:[{start:0,count:index?.count??p.count,materialIndex:0}];
    const indices:number[]=[],groups:Array<{start:number;count:number;materialIndex:number}>=[];
    for(const draw of oldGroups){const start=indices.length;
      for(let i=draw.start;i<draw.start+draw.count;i+=3){
        const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j);
        if(targets.has(find(offsets[m]+ids[0]))){removed++;continue;}indices.push(...ids);
      }
      if(indices.length>start)groups.push({start,count:indices.length-start,materialIndex:draw.materialIndex??0});
    }
    geometry.setIndex(indices);geometry.clearGroups();for(const g of groups)geometry.addGroup(g.start,g.count,g.materialIndex);
  });
  return {components:targets.size,triangles:removed};
}

export function createCityHall() {
  const root=new THREE.Group();root.name='numazu-city-hall';root.position.set(CITY_HALL.x,CITY_HALL.y,CITY_HALL.z);root.rotation.y=CITY_HALL.rotation;
  root.userData.photoReferenceModel=true;
  const detail=new THREE.Group();detail.name='city-hall-near-details';root.add(detail);
  const collider=new THREE.Group();collider.name='city-hall-collision';collider.position.copy(root.position);collider.rotation.copy(root.rotation);
  const materials={
    wall:new THREE.MeshStandardMaterial({color:0xd3d4cf,roughness:.88}),
    concrete:new THREE.MeshStandardMaterial({color:0x8c8d83,roughness:.96}),
    stone:new THREE.MeshStandardMaterial({color:0x505651,roughness:.92}),
    glass:new THREE.MeshStandardMaterial({color:0x52636a,metalness:.25,roughness:.32}),
    frame:new THREE.MeshStandardMaterial({color:0x777f7c,metalness:.4,roughness:.5}),
    shadow:new THREE.MeshStandardMaterial({color:0x303b3c,roughness:1}),
    paving:new THREE.MeshStandardMaterial({color:0x99988b,roughness:1}),
  };
  materials.wall.onBeforeCompile=shader=>addPhotoSurfaceDetail(shader,'building');materials.wall.customProgramCacheKey=()=> 'city-hall-wall-v1';
  type Slot=keyof typeof materials;
  const batches=new Map<string,{slot:Slot;near:boolean;parts:THREE.BufferGeometry[]}>();
  function box(slot:Slot,x:number,y:number,z:number,w:number,h:number,d:number,near=false,solid=false){
    const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);const key=slot+near;
    let batch=batches.get(key);if(!batch){batch={slot,near,parts:[]};batches.set(key,batch);}batch.parts.push(g);
    if(solid){const m=new THREE.Mesh(g.clone());collider.add(m);}
  }
  // Primary tower, lower wing and rooftop plant room match the source footprint.
  box('shadow',-3.45,21.65,-1.4,34.7,43.3,36.2,false,true);
  box('wall',-19.4,8.95,-20,21.4,17.9,79.4,false,true);
  box('concrete',-3.45,43.4,-1.4,35.2,.3,36.7);
  box('wall',-.5,49.1,-1,12.5,11.4,13,false,true);
  box('frame',-.5,55.8,-1,.15,2.2,.15,true);
  for(let x=-5;x<5;x+=1.2)box('frame',x,49.3,5.55,.06,7,.1,true);
  // Window bands remain on the coarse model; fine mullions/joints only nearby.
  function facade(width:number,floors:number,pitch:number,origin:THREE.Vector3,angle:number){
    function part(slot:Slot,x:number,y:number,z:number,w:number,h:number,d:number,near=false){
      const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);g.rotateY(angle);g.translate(origin.x,origin.y,origin.z);
      const key=slot+near;let b=batches.get(key);if(!b){b={slot,near,parts:[]};batches.set(key,b);}b.parts.push(g);
    }
    for(let floor=0;floor<floors;floor++){
      const y=floor*pitch;
      part('glass',0,y+pitch*.66,-.06,width-.3,pitch*.5,.08);
      part('wall',0,y+pitch*.23,.14,width,pitch*.46,.4);
      part('concrete',0,y+pitch*.46,.34,width,.16,.8);
      for(let x=-width/2+1.2;x<width/2-.3;x+=2.4){part('frame',x,y+pitch*.66,.02,.055,pitch*.5,.12,true);}
      for(let x=-width/2+.95;x<width/2;x+=2.9){part('frame',x,y+pitch*.23,.355,.018,pitch*.44,.015,true);}
      part('frame',0,y+pitch*.22,.36,width,.018,.015,true);
    }
    const bays=Math.round(width/11.5);
    for(let i=0;i<=bays;i++)part('wall',-width/2+i*width/bays,floors*pitch/2,.27,.8,floors*pitch,.65);
  }
  facade(36.2,9,4.8,new THREE.Vector3(13.94,0,-1.4),Math.PI/2);
  facade(36.2,9,4.8,new THREE.Vector3(-20.84,0,-1.4),-Math.PI/2);
  facade(34.7,9,4.8,new THREE.Vector3(-3.45,0,16.74),0);
  facade(34.7,9,4.8,new THREE.Vector3(-3.45,0,-19.54),Math.PI);
  facade(79.4,3,5.9,new THREE.Vector3(-30.14,0,-20),-Math.PI/2);
  facade(21.4,3,5.9,new THREE.Vector3(-19.4,0,-59.74),Math.PI);
  // Reception behind a genuinely open forecourt, unlike the old closed shell.
  box('wall',-8,3.76,21,43.5,7.52,8.4,false,true);
  box('glass',-8,2.5,25.25,30,4.2,.1);
  for(let x=-22;x<8;x+=1.5)box('frame',x,2.5,25.4,.07,4.2,.12,true);
  for(let x=-4;x<=2;x+=2)box('frame',x,2.3,25.5,.09,3.3,.16,true);
  // Roof, four tiled columns, exposed beams and ceiling lights.
  box('wall',-7.8,7.15,33.1,43.3,.75,16.5,false,true);
  for(const x of [-28,12])for(const z of [27,39]){
    box('wall',x,3.5,z,2.7,7,2.7,false,true);
    for(let y=.5;y<6.8;y+=.85){box('frame',x,y,z+1.357,2.7,.018,.012,true);box('frame',x+1.357,y,z,.012,.018,2.7,true);}
    box('stone',x,.35,z,2.76,.7,2.76);
  }
  for(let z=27;z<=39;z+=3){box('concrete',-8,6.58,z,39,.35,.32,true);for(const x of [-20,-8,4])box('wall',x,6.35,z,.45,.025,.45,true);}
  // A shallow, walkable ramp replaces microscopic stair collisions. Visible
  // treads and a side ramp preserve the entrance character without trapping feet.
  const stairCount=6,run=4.2,rise=.72;
  for(let i=0;i<stairCount;i++)box('paving',-8,(i+1)*rise/stairCount/2,25.8+(stairCount-1-i)*run/stairCount,33,(i+1)*rise/stairCount,run/stairCount);
  box('paving',-8,.34,26,33,.68,1,false,true);
  const ramp=new THREE.BufferGeometry();const x0=-24.5,x1=8.5,z0=25.4,z1=30.7;
  ramp.setAttribute('position',new THREE.Float32BufferAttribute([x0,.74,z0,x0,.42,z1,x1,.74,z0,x1,.74,z0,x0,.42,z1,x1,.42,z1],3));
  ramp.computeVertexNormals();collider.add(new THREE.Mesh(ramp));
  // Side approach and modest forecourt details based on the supplied views.
  box('paving',-8,.18,35,44,.44,19,false,true);
  for(const x of [-24,8]){box('concrete',x,.45,44,2,.9,1.2,true);box('stone',x,.94,44,1.8,.1,1,true);}
  for(const [key,batch] of batches){
    const geometry=mergeGeometries(batch.parts)!;batch.parts.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geometry,materials[batch.slot]);mesh.name='city-hall-'+key;(batch.near?detail:root).add(mesh);
  }
  // Merge collision boxes into one unrendered group, separate from detail LOD.
  const collisionParts=(collider.children as THREE.Mesh[]).map(m=>m.geometry);
  const collisionFlat=collisionParts.map(g=>{const flat=g.index?g.toNonIndexed():g.clone();flat.deleteAttribute('normal');flat.deleteAttribute('uv');return flat;});
  const collisionGeometry=mergeGeometries(collisionFlat)!;collisionFlat.forEach(g=>g.dispose());collisionGeometry.computeVertexNormals();
  collisionParts.forEach(g=>g.dispose());const collisionMaterials=new Set((collider.children as THREE.Mesh[]).map(m=>m.material as THREE.Material));collisionMaterials.forEach(m=>m.dispose());collider.clear();
  const collisionMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});collider.add(new THREE.Mesh(collisionGeometry,collisionMaterial));
  root.updateMatrixWorld(true);collider.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root),photos=createCityHallPhotos(root);let disposed=false;
  return {root,collider,photoReady:photos.settled,update(viewer:THREE.Vector3){if(!disposed){detail.visible=bounds.distanceToPoint(viewer)<(detail.visible?240:210);photos.update(viewer);}},dispose(){if(disposed)return;disposed=true;photos.dispose();root.removeFromParent();root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});Object.values(materials).forEach(m=>m.dispose());collisionGeometry.dispose();collisionMaterial.dispose();}};
}
