// Rebuild station corridor assets, excluding the existing port building tiles.
import { readFileSync, writeFileSync, mkdirSync, existsSync, symlinkSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extractEntry } from './extract-entry.mjs';
import { parseGlb } from './inspect-b3dm.mjs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const output = fileURLToPath(new URL('../spike-3d/public/data/', import.meta.url));
const bbox = { west: 138.853, east: 138.8655, south: 35.080, north: 35.1048 };
const rad = Math.PI / 180;
function hits(r) { return r && r[0] <= bbox.east*rad && r[2] >= bbox.west*rad && r[1] <= bbox.north*rad && r[3] >= bbox.south*rad; }
function leaves(t, out=[]) { const uri=t.content?.uri??t.content?.url; if (uri && !t.children?.length && hits(t.boundingVolume?.region)) out.push({uri,region:t.boundingVolume.region}); for(const child of t.children??[]) leaves(child,out); return out; }
const old = new Set(JSON.parse(readFileSync(root+'port-tiles.json')).lod2.portTiles.map(t=>t.uri));
const port = JSON.parse(readFileSync(root+'convert-tex-stats.json'));
const manifest = { bbox, station: {lat:35.1031,lon:138.8599}, additionalTextureMaxPixels: 1024, chunks: [{id:'port',url:'data/port-bldg-tex-packed.glb',min:port.min,max:port.max,buildings:525,withPhotos:434,triangles:port.triangles,images:port.images,tiles:[...old]}] };
for (const theme of ['bldg_lod2','tran_lod3','veg']) {
 const cache = `/tmp/plateau-scratch/${theme}-station-tileset.json`;
 if (!existsSync(cache)) { mkdirSync('/tmp/plateau-scratch',{recursive:true}); writeFileSync(cache,await extractEntry(`${theme}/tileset.json`)); }
 const tiles = leaves(JSON.parse(readFileSync(cache)).root).filter(t=>theme!=='bldg_lod2'||!old.has(t.uri));
 console.log(theme,tiles.length,'tiles');
 if(process.argv.includes('--inspect')) continue;
 const groups=new Map();
 for(const tile of tiles) {
  const lat=(tile.region[1]+tile.region[3])/2/rad, lon=(tile.region[0]+tile.region[2])/2/rad;
  const key=theme==='bldg_lod2'?`station-${Math.floor((lat-35.080)/.003)}-${Math.floor((lon-138.850)/.006)}`:theme==='veg'?'corridor-veg':'corridor-road';
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tile);
 }
 let cursor=0;
 const cacheDir=`/tmp/plateau-scratch/source-${theme}`;mkdirSync(cacheDir,{recursive:true});
 await Promise.all(Array.from({length:4},async()=>{while(cursor<tiles.length){const tile=tiles[cursor++]; const path=cacheDir+'/'+tile.uri.split('/').pop(); if(!existsSync(path))writeFileSync(path,await extractEntry(`${theme}/${tile.uri}`));}}));
 for(const [id,group] of groups) {
  const dir=`/tmp/plateau-scratch/tiles/${id}`;rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
  for(const tile of group) {const name=tile.uri.split('/').pop();symlinkSync(cacheDir+'/'+name,dir+'/'+name);}
  execFileSync(process.execPath,['convert-bldg-tex.mjs',id,`${id}.glb`,`${id}-stats.json`,id],{cwd:root,stdio:['ignore','ignore','inherit']});
  const stats=JSON.parse(readFileSync(root+`${id}-stats.json`));
  if(stats.failed.length)throw new Error(`${id}: failed conversions`);
  if(theme==='bldg_lod2')execFileSync('python',['resize-glb-photos.py',`${id}.glb`,'1024'],{cwd:root,stdio:'inherit'});
  execFileSync(root+'node_modules/.bin/gltfpack',['-i',root+`${id}.glb`,'-o',output+`${id}-packed.glb`,'-cc'],{stdio:'inherit'});
  const packed = parseGlb(readFileSync(output+`${id}-packed.glb`)).json;
  const packedTriangles = packed.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((n, p) => n + packed.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0), 0);
  if(theme==='bldg_lod2')manifest.chunks.push({id,url:`data/${id}-packed.glb`,min:stats.min,max:stats.max,buildings:stats.buildingCoverage.total,withPhotos:stats.buildingCoverage.withPhotos,triangles:packedTriangles,sourceTriangles:stats.triangles,images:stats.images,tiles:group.map(t=>t.uri)});
  console.log(id,stats.buildingCoverage.total,'buildings',stats.images,'photos');
 }
}
if(!process.argv.includes('--inspect'))writeFileSync(output+'station-manifest.json',JSON.stringify(manifest,null,2)+'\n');
