import * as THREE from 'three';
export const BUILDING_HEIGHT_SCALE=1.3;

/** Raise roofs from each connected building's base, without moving streets or terrain. */
export function emphasizeBuildingHeights(group:THREE.Group,factor=BUILDING_HEIGHT_SCALE){
 if(factor===1||group.userData.buildingHeightScale)return;
 group.updateMatrixWorld(true);
 const meshes:THREE.Mesh[]=[];group.traverse(o=>{if(o instanceof THREE.Mesh&&o.geometry.getAttribute('position'))meshes.push(o);});
 const count=meshes.reduce((n,m)=>n+m.geometry.getAttribute('position').count,0),parent=new Int32Array(count),world=new Float32Array(count*3);
 for(let i=0;i<count;i++)parent[i]=i;
 const find=(value:number)=>{while(parent[value]!==value){parent[value]=parent[parent[value]];value=parent[value];}return value;};
 const join=(a:number,b:number)=>{a=find(a);b=find(b);if(a!==b)parent[b]=a;};
 const columns=new Map<string,number>(),point=new THREE.Vector3();let offset=0;
 const offsets:number[]=[];
 for(const mesh of meshes){
  offsets.push(offset);const p=mesh.geometry.getAttribute('position'),index=mesh.geometry.index;
  for(let i=0;i<p.count;i++){
   point.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);point.toArray(world,(offset+i)*3);
   // Weld UV seams and the roof/wall boundaries, including vertical columns.
   const key=`${Math.round(point.x*20)},${Math.round(point.z*20)}`,previous=columns.get(key);
   if(previous!==undefined)join(offset+i,previous);else columns.set(key,offset+i);
  }
  for(let i=0;i<(index?.count??p.count);i+=3){const a=offset+(index?index.getX(i):i);join(a,offset+(index?index.getX(i+1):i+1));join(a,offset+(index?index.getX(i+2):i+2));}
  offset+=p.count;
 }
 const bases=new Map<number,number>();for(let i=0;i<count;i++){const root=find(i),y=world[i*3+1];bases.set(root,Math.min(bases.get(root)??Infinity,y));}
 const originals=new Set<THREE.BufferGeometry>();
 meshes.forEach((mesh,meshIndex)=>{
  const original=mesh.geometry,geometry=original.clone(),positions=new Float32Array(original.getAttribute('position').count*3),inverse=mesh.matrixWorld.clone().invert();originals.add(original);
  const normal=original.getAttribute('normal'),normals=normal?new Float32Array(normal.count*3):null;
  const normalWorld=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld),normalLocal=normalWorld.clone().invert();
  for(let i=0;i<positions.length/3;i++){
   const vertex=offsets[meshIndex]+i,base=bases.get(find(vertex))!;
   point.fromArray(world,vertex*3);point.y=base+(point.y-base)*factor;point.applyMatrix4(inverse).toArray(positions,i*3);
   if(normal&&normals){point.fromBufferAttribute(normal,i).applyNormalMatrix(normalWorld);point.y/=factor;point.applyNormalMatrix(normalLocal).toArray(normals,i*3);}
  }
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));if(normals)geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();mesh.geometry=geometry;mesh.userData.buildingHeightScale=factor;
 });
 originals.forEach(g=>g.dispose());group.userData.buildingHeightScale=factor;group.userData.heightComponents=bases.size;
}
