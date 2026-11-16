#!/usr/bin/env node
// Remove one building by original gml_id, never by a bounding box in a merged GLB.
// Usage: node scripts/regenerate-chunk-override.mjs port bldg_... [output.glb]
import {readFileSync,writeFileSync,mkdirSync,existsSync,symlinkSync,copyFileSync} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const preview=process.env.PREVIEW_ROOT||resolve(root,'../shinkai-atsume-preview');
const [chunkId,buildingId,outputArg]=process.argv.slice(2);
if(!chunkId||!buildingId)throw Error('Specify chunkId and original gml_id explicitly');
const output=outputArg||`2023-lod3-${chunkId}-ovr1-packed.glb`;
if(output!==basename(output)||!output.endsWith('.glb'))throw Error('Output must be a GLB filename');
const manifest=JSON.parse(readFileSync(resolve(root,'public/map/data/station-manifest.json')));
const chunk=manifest.chunks.find(c=>c.id===chunkId);if(!chunk)throw Error('Unknown chunk');
const label=`2023-override-${chunkId}`,cache='/tmp/plateau-scratch/source-bldg2023';
const scratch=`/tmp/plateau-scratch/tiles/${label}`,generator=resolve(preview,'realdata-test');
mkdirSync(cache,{recursive:true});mkdirSync(scratch,{recursive:true});
for(const uri of chunk.tiles){
 const name=uri.replaceAll('/','_'),source=resolve(cache,name),link=resolve(scratch,name);
 if(!existsSync(source)){
  const response=await fetch(new URL(uri,manifest.source));if(!response.ok)throw Error(`Source HTTP ${response.status}`);
  writeFileSync(source,Buffer.from(await response.arrayBuffer()));
 }
 if(!existsSync(link))symlinkSync(source,link);
}
execFileSync(process.execPath,['convert-bldg-tex.mjs',label,`${label}.glb`,`${label}-stats.json`,label],{cwd:generator,env:{...process.env,EXCLUDE_GML_IDS:buildingId},stdio:'inherit'});
const stats=JSON.parse(readFileSync(resolve(generator,`${label}-stats.json`)));
if(stats.failed.length||!stats.excludedTriangles?.[buildingId])throw Error('Source filtering not verified');
execFileSync('python',[resolve(generator,'resize-glb-photos.py'),resolve(generator,`${label}.glb`),'2048'],{stdio:'inherit'});
execFileSync(process.env.GLTFPACK_PATH||resolve(generator,'node_modules/.bin/gltfpack'),['-i',resolve(generator,`${label}.glb`),'-o',resolve(root,'public/map/data',output),'-cc'],{stdio:'inherit'});
console.log(JSON.stringify({chunkId,buildingId,excludedTriangles:stats.excludedTriangles,remainingBuildings:stats.buildingCoverage.total,output}));
console.log('Verify neighbours and update the reviewed release manifest before publishing.');
