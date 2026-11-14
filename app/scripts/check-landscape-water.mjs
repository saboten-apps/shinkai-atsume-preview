import {createRequire} from 'node:module';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const proxyUrl=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const proxy=proxyUrl?{server:proxyUrl.origin,username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password),bypass:'127.0.0.1,localhost'}:undefined;
const browser=await chromium.launch({proxy,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const metadata=JSON.parse(await readFile(new URL('../public/environment/numazu-region.json',import.meta.url)));
 assert(metadata.bytes<1000000);assert(metadata.verticalExaggeration===1);
 assert(metadata.maxElevation>3500&&metadata.maxElevation<3900);
 assert(metadata.checkpoints.find(p=>p.name.includes('愛鷹')).nearbyMax>1400);
 const page=await browser.newPage({viewport:{width:1280,height:760}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(/WebGLProgram|Feedback loop|GL_INVALID/.test(m.text()))errors.push(m.text());});
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5180/');
 await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {buildNumazuPortScene}=await import('/src/features/exploration/map/three/sceneBuilder.ts');
  const {createPortSky}=await import('/src/features/exploration/map/three/portSky.ts');
  const scene=new THREE.Scene(),sky=createPortSky(scene);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1280,760);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const camera=new THREE.PerspectiveCamera(45,1280/760,1,55000);
  scene.add(new THREE.AmbientLight(0xf5f0e6,.9));const sun=new THREE.DirectionalLight(0xfff7ed,1.4);sun.position.set(300,500,200);scene.add(sun);
  const model=buildNumazuPortScene(scene);await model.ready;model.updateBuildings(new THREE.Vector3(0,45,-190));await model.groundReady();
  // Let the adjacent building chunks finish for the visual captures.
  for(let i=0;i<25;i++){model.updateBuildings(new THREE.Vector3(0,45,-190));await new Promise(r=>setTimeout(r,100));}
  window.landscapeCheck={THREE,scene,sky,model,renderer,camera};
 });
 const shots=[
  {id:'ashitaka',eye:[150,90,220],target:[-5500,900,-18000]},
  {id:'numazu-alps',eye:[-150,95,-190],target:[2400,180,-1000]},
  {id:'water',eye:[220,150,140],target:[-80,41,-180]},
 ];
 const reports=[];
 for(const shot of shots){
  const result=await page.evaluate(async shot=>{
   const {scene,renderer,camera,model}=window.landscapeCheck;
   camera.position.set(...shot.eye);camera.lookAt(...shot.target);model.updateWater(.1);renderer.render(scene,camera);
   const reflector=scene.getObjectByName('numazu-water-reflector');
   const target=reflector.getRenderTarget();
   return {image:renderer.domElement.toDataURL('image/png').split(',')[1],landscape:!!scene.getObjectByName('numazu-regional-landscape'),reflection:[target.width,target.height],reflectionReady:reflector.material.uniforms.uHasReflection.value,time:reflector.material.uniforms.uTime.value};
  },shot);
  await writeFile(`/tmp/shinkai-${shot.id}.png`,Buffer.from(result.image,'base64'));
  assert(result.landscape);assert.deepEqual(result.reflection,[256,256]);assert(result.reflectionReady===1);
  reports.push({view:shot.id,reflection:result.reflection,time:result.time});
 }
 const lifecycle=await page.evaluate(()=>{
  const {scene,sky,model}=window.landscapeCheck;
  const landscape=scene.getObjectByName('numazu-regional-landscape');
  sky.setUnderwater(true);const underwaterHidden=!landscape.visible;sky.setUnderwater(false);
  const aboveWaterVisible=landscape.visible;
  const reflector=scene.getObjectByName('numazu-water-reflector');let targetDisposed=false;
  reflector.getRenderTarget().addEventListener('dispose',()=>targetDisposed=true);
  model.dispose();sky.dispose();return{underwaterHidden,aboveWaterVisible,targetDisposed};
 });
 assert(lifecycle.underwaterHidden&&lifecycle.aboveWaterVisible&&lifecycle.targetDisposed);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'pass',terrainBytes:metadata.bytes,views:reports,lifecycle,errors},null,2));
}finally{await browser.close();}
