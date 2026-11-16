import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5190/',{waitUntil:'domcontentloaded'});
 const report=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js');
  const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  const {MeshoptDecoder}=await import('/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
  const {BuildingOverrideManager,BASE_RELEASE_ID}=await import('/src/features/exploration/map/three/buildingOverride.ts');
  const manager=new BuildingOverrideManager();
  if(!await manager.loadManifest('/map/'))throw Error('Reviewed manifest rejected');
  const originalUrl='data/2023-lod3-port-packed.glb';
  const replacementUrl=manager.getChunkUrl('port',originalUrl);
  if(originalUrl===replacementUrl)throw Error('Replacement not selected');
  if(manager.getChunkUrl('station-5-2','original.glb')!=='original.glb')throw Error('Unverified demolition enabled');
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [base,replaced,data]=await Promise.all([loader.loadAsync('/map/'+originalUrl),loader.loadAsync('/map/'+replacementUrl),fetch('/map/data/buildings-port.json').then(r=>r.json())]);
  base.scene.updateMatrixWorld(true);replaced.scene.updateMatrixWorld(true);
  let checked=0;const differences=[];
  for(const b of data.buildings){
   if(b.id==='bldg_7380cb7d-8b33-48d5-b9d1-6324ae3d6526')continue;
   const ray=new T.Raycaster(new T.Vector3(b.center[0],500,b.center[2]),new T.Vector3(0,-1,0));
   const before=ray.intersectObject(base.scene,true)[0],after=ray.intersectObject(replaced.scene,true)[0];
   if(!before)continue;
   checked++;
   if(!after || Math.abs(before.point.y-after.point.y)>.15)differences.push({id:b.id,before:before.point.y,after:after?.point.y});
  }
  manager.revertToOriginal();
  return {checked,differences,rollback:manager.getChunkUrl('port',originalUrl)===originalUrl,release:manager.getActiveReleaseId(),baseRelease:BASE_RELEASE_ID};
 });
 assert(report.checked>20);assert.deepEqual(report.differences,[]);assert(report.rollback);
 console.log(JSON.stringify({result:'pass',...report},null,2));
}finally{await browser.close();}
