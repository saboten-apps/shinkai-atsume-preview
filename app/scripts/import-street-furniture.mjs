// Official PLATEAU 2023 leaf tiles only, converted in the application's ENU frame.
// Requires draco3d and gltfpack as offline build tools, never browser dependencies.
import {readFile,writeFile,mkdir,stat,symlink,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseB3dm,parseGlb} from './lib/plateau-glb.mjs';
const source='https://assets.cms.plateau.reearth.io/assets/7e/db8815-156f-4a68-bed4-16ce79eec12b/22203_numazu-shi_city_2023_citygml_3_op_frn_3dtiles_lod3/tileset.json';
const cache=process.env.FURNITURE_CACHE||'/tmp/plateau-scratch/source-frn2023';
const output=fileURLToPath(new URL('../public/environment/street-furniture/',import.meta.url));
await mkdir(cache,{recursive:true});await mkdir(output,{recursive:true});
async function get(url){const response=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`HTTP ${response.status}: ${url}`);return Buffer.from(await response.arrayBuffer());}
const tileset=JSON.parse(await get(source));const leaves=[];
function walk(t){if(!t.children?.length&&t.content)leaves.push(t);else for(const c of t.children??[])walk(c);}walk(tileset.root);
let next=0,downloaded=0;await Promise.all(Array.from({length:8},async()=>{while(next<leaves.length){const t=leaves[next++],uri=t.content.uri??t.content.url;if(!/^data\/data\d+\.b3dm$/.test(uri))throw Error('Unexpected source path');t.file=cache+'/'+uri.split('/').pop();try{await stat(t.file);}catch{await writeFile(t.file,await get(new URL(uri,source)));}if(++downloaded%100===0)console.log('Source tiles',downloaded,'/',leaves.length);}}));
const types=new Map(),features=new Map(),groups=new Map();
for(const tile of leaves){const b=await readFile(tile.file),start=28+b.readUInt32LE(12)+b.readUInt32LE(16),n=b.readUInt32LE(20),batch=JSON.parse(b.toString('utf8',start,start+n).replace(/\0+$/,'').trim());for(const a of batch.attributes??[]){const id=a['gml:id'];if(!id||features.has(id))continue;features.set(id,a);const type=a['uro:CityFurnitureDetailAttribute']?.[0]?.['uro:facilityType']??a['frn:function']??'不明';types.set(type,(types.get(type)??0)+1);}
 const r=tile.boundingVolume.region,lat=(r[1]+r[3])/2*180/Math.PI,z=(35.0815-lat)*110900,id='frn-'+Math.floor(z/120);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(tile);}
const chunks=[];
for(const [id,tiles] of groups){const dir='/tmp/plateau-scratch/tiles/'+id;await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});for(const t of tiles)await symlink(t.file,dir+'/'+t.file.split('/').pop());const raw='/tmp/'+id+'.glb',stats='/tmp/'+id+'.json';execFileSync(process.execPath,[fileURLToPath(new URL('./lib/plateau-furniture-convert.mjs',import.meta.url)),id,raw,stats,'2023-'+id],{stdio:'inherit'});const s=JSON.parse(await readFile(stats));if(s.failed.length)throw Error('Conversion failures');execFileSync('python3',[fileURLToPath(new URL('./lib/atlas-plateau-furniture.py',import.meta.url)),raw]);const name=id+'.glb';execFileSync(process.env.GLTFPACK||'gltfpack',['-i',raw,'-o',output+name,'-cc','-si','0.75','-se','0.001'],{stdio:'inherit'});const bytes=await readFile(output+name),{json}=parseGlb(bytes);chunks.push({id,url:name,min:s.min,max:s.max,bytes:bytes.length,tiles:tiles.length,draws:json.meshes.reduce((n,m)=>n+m.primitives.length,0),triangles:json.meshes.reduce((n,m)=>n+m.primitives.reduce((sum,p)=>sum+json.accessors[p.indices??p.attributes.POSITION].count/3,0),0)});}
const functions={};for(const a of features.values()){const k=a['frn:function']??'不明';functions[k]=(functions[k]??0)+1;}
const manifest={version:1,year:2023,source,sourceLod:3,sourceTiles:leaves.length,features:features.size,functions,types:Object.fromEntries(types),boundsRadians:tileset.root.boundingVolume.region,totalBytes:chunks.reduce((n,c)=>n+c.bytes,0),chunks};await writeFile(output+'manifest.json',JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({...manifest,chunks:chunks.length},null,2));
