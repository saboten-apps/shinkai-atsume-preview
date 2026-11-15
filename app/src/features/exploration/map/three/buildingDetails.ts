import * as THREE from 'three';

type Detail={sourceName:string;url:string;width:number;height:number};
type Ref={material:THREE.MeshStandardMaterial;base:THREE.Texture;bounds:THREE.Box3};
type Atlas={name:string;refs:Set<Ref>;detail?:Detail;texture?:THREE.Texture;state:'idle'|'loading'|'loaded';retryAt:number};
const LIMIT=3,NEAR=110,RETAIN=160;

/** Only a few nearby photographic atlases get restored to their original detail. */
export function createBuildingDetails(){
 const abort=new AbortController(),loader=new THREE.TextureLoader();
 const records=new Map<string,Atlas>(),descriptions=new Map<string,Detail>();
 const viewer=new THREE.Vector3(0,300,0);
 let disposed=false,loading=false,nextUpdate=0;
 const waiters=new Set<()=>void>();
 const ready=fetch(`${import.meta.env.BASE_URL}environment/building-details/manifest.json`,{signal:abort.signal})
  .then(async response=>{if(!response.ok)throw new Error(`Detail manifest ${response.status}`);return response.json();})
  .then((manifest:{entries:Detail[]})=>{
   if(disposed)return;
   for(const entry of manifest.entries)descriptions.set(entry.sourceName,entry);
   for(const atlas of records.values())atlas.detail=descriptions.get(atlas.name);
   pump();
  }).catch(error=>{if(!disposed)console.warn('Building detail unavailable:',error);});
 const distance=(atlas:Atlas)=>{let value=Infinity;for(const ref of atlas.refs)value=Math.min(value,ref.bounds.distanceToPoint(viewer));return value;};
 function desired(){
  return [...records.values()].filter(a=>a.detail&&a.refs.size&&distance(a)<(a.texture?RETAIN:NEAR))
   .sort((a,b)=>(distance(a)-(a.texture?20:0))-(distance(b)-(b.texture?20:0))).slice(0,LIMIT);
 }
 function release(atlas:Atlas){
  for(const ref of atlas.refs){ref.material.map=ref.base;ref.material.emissiveMap=ref.base;ref.material.needsUpdate=true;}
  atlas.texture?.dispose();atlas.texture=undefined;
  if(atlas.state!=='loading')atlas.state='idle';
 }
 function idle(){if(loading||desired().some(a=>a.state==='idle'&&a.retryAt<=performance.now()))return;for(const done of waiters)done();waiters.clear();}
 function pump(){
  if(disposed)return;
  const candidates=desired(),keep=new Set(candidates);
  for(const atlas of records.values())if(atlas.texture&&!keep.has(atlas))release(atlas);
  if(loading)return;
  const atlas=candidates.find(a=>a.state==='idle'&&a.retryAt<=performance.now());
  if(!atlas){idle();return;}
  atlas.state='loading';loading=true;
  loader.load(import.meta.env.BASE_URL+atlas.detail!.url,texture=>{
   loading=false;atlas.state='idle';
   if(disposed||!atlas.refs.size||!desired().includes(atlas)){texture.dispose();pump();return;}
   const original=atlas.refs.values().next().value!.base;
   texture.name=atlas.name;texture.flipY=original.flipY;texture.colorSpace=original.colorSpace;
   texture.wrapS=original.wrapS;texture.wrapT=original.wrapT;texture.minFilter=original.minFilter;texture.magFilter=original.magFilter;
   texture.repeat.copy(original.repeat);texture.offset.copy(original.offset);texture.center.copy(original.center);texture.rotation=original.rotation;texture.channel=original.channel;texture.anisotropy=4;
   atlas.texture=texture;atlas.state='loaded';
   for(const ref of atlas.refs){ref.material.map=texture;ref.material.emissiveMap=texture;ref.material.needsUpdate=true;}
   pump();
  },undefined,()=>{loading=false;atlas.state='idle';atlas.retryAt=performance.now()+60000;pump();});
 }
 return {
  ready,
  register(group:THREE.Group){
   group.updateMatrixWorld(true);const refs:Array<{atlas:Atlas;ref:Ref}>=[];const seen=new Set<THREE.Material>();
   group.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const bounds=new THREE.Box3().setFromObject(object);
    for(const material of Array.isArray(object.material)?object.material:[object.material]){
     if(!(material instanceof THREE.MeshStandardMaterial)||!material.map)continue;
     const name=material.map.name;if(!name)continue;
     let atlas=records.get(name);
     if(!atlas){atlas={name,refs:new Set(),detail:descriptions.get(name),state:'idle',retryAt:0};records.set(name,atlas);}
     if(seen.has(material)){
      const previous=refs.find(r=>r.ref.material===material);previous?.ref.bounds.union(bounds);continue;
     }
     seen.add(material);
     const ref={material,base:material.map,bounds:bounds.clone()};atlas.refs.add(ref);refs.push({atlas,ref});
     if(atlas.texture){material.map=atlas.texture;material.emissiveMap=atlas.texture;material.needsUpdate=true;}
    }
   });
   return ()=>{for(const {atlas,ref} of refs){ref.material.map=ref.base;ref.material.emissiveMap=ref.base;atlas.refs.delete(ref);if(!atlas.refs.size){release(atlas);records.delete(atlas.name);}}};
  },
  update(position:THREE.Vector3){viewer.copy(position);if(performance.now()<nextUpdate)return;nextUpdate=performance.now()+600;pump();},
  async settled(timeout=6000){await ready;if(disposed)return;pump();await new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);waiters.delete(done);resolve();};const timer=setTimeout(done,timeout);waiters.add(done);idle();});},
  dispose(){disposed=true;abort.abort();for(const atlas of records.values())release(atlas);records.clear();for(const done of waiters)done();waiters.clear();},
 };
}
