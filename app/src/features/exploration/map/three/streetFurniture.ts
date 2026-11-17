import * as THREE from 'three';
import type {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
type Chunk={id:string;url:string;min:number[];max:number[];draws:number};
/** Source-coordinate street furniture, visual only. Independent from collision
 * and building selection so hundreds of thin poles never create physics trees. */
export function streamStreetFurniture(scene:THREE.Scene,loader:Pick<GLTFLoader,'loadAsync'>,base:string){
 const abort=new AbortController(),loaded=new Map<string,THREE.Group>(),retry=new Map<string,number>();
 let chunks:Chunk[]=[],disposed=false,loading=false,next=0;const viewer=new THREE.Vector3();
 const release=(group:THREE.Group)=>{group.removeFromParent();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);if(m instanceof THREE.MeshStandardMaterial)for(const t of [m.map,m.normalMap,m.emissiveMap,m.roughnessMap,m.metalnessMap])if(t)textures.add(t);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>{t.dispose();t.image?.close?.();});};
 const ready=fetch(base+'manifest.json',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error(`Street furniture HTTP ${r.status}`);return r.json();}).then(m=>{if(!disposed)chunks=m.chunks.filter((c:Chunk)=>/^frn--?\d+\.glb$/.test(c.url)&&c.min.length===3&&c.max.length===3&&[...c.min,...c.max].every(Number.isFinite));}).catch(e=>{if(!disposed)console.warn('Street furniture unavailable',e);});
 const distance=(c:Chunk)=>Math.hypot(Math.max(c.min[0]-viewer.x,0,viewer.x-c.max[0]),Math.max(c.min[2]-viewer.z,0,viewer.z-c.max[2]));
 return{ready,update(position:THREE.Vector3,now=performance.now()){
  if(disposed)return;viewer.copy(position);if(now<next)return;next=now+500;
  const high=viewer.y>180||!!scene.userData.underwater;
  for(const c of chunks){const g=loaded.get(c.id);if(g&&(distance(c)>220||viewer.y>350)){release(g);loaded.delete(c.id);}else if(g)g.visible=false;}
  if(loaded.size>4){for(const c of [...chunks].filter(c=>loaded.has(c.id)).sort((a,b)=>distance(b)-distance(a)).slice(0,loaded.size-4)){release(loaded.get(c.id)!);loaded.delete(c.id);}}
  if(high)return;
  // At most two neighboring districts and a fixed source draw budget are visible.
  const nearby=chunks.filter(c=>distance(c)<95).sort((a,b)=>distance(a)-distance(b));const wanted:Chunk[]=[];let budget=0;
  for(const c of nearby){if(wanted.length>=2)break;if(budget+c.draws>24)continue;wanted.push(c);budget+=c.draws;}
  for(const c of wanted){const g=loaded.get(c.id);if(g)g.visible=true;}
  if(loading)return;
  const c=wanted.find(c=>!loaded.has(c.id)&&now>=(retry.get(c.id)??0));if(!c)return;loading=true;
  void loader.loadAsync(base+c.url).then(gltf=>{const group=gltf.scene;if(disposed||distance(c)>220){release(group);return;}
   group.name='plateau-street-furniture-'+c.id;group.userData.streetFurniture=true;
   group.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.castShadow=false;o.receiveShadow=false;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshStandardMaterial){m.metalness=Math.min(m.metalness,.2);m.roughness=Math.max(.7,m.roughness);if(m.map)m.map.anisotropy=2;}});
   if(loaded.size>=4){const far=[...chunks].filter(item=>loaded.has(item.id)).sort((a,b)=>distance(b)-distance(a))[0];if(far){release(loaded.get(far.id)!);loaded.delete(far.id);}}
   group.visible=false;scene.add(group);loaded.set(c.id,group);retry.delete(c.id);
  }).catch(e=>{if(!disposed){retry.set(c.id,performance.now()+10000);console.warn('Street furniture chunk unavailable',c.id,e);}}).finally(()=>{loading=false;next=0;});
 },loadedCount:()=>loaded.size,dispose(){if(disposed)return;disposed=true;abort.abort();loaded.forEach(release);loaded.clear();}};
}
