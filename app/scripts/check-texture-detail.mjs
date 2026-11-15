import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const proxyUrl=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const proxy=proxyUrl?{server:proxyUrl.origin,username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password),bypass:'127.0.0.1,localhost'}:undefined;
const browser=await chromium.launch({proxy,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const manifest=JSON.parse(await readFile(new URL('../public/environment/building-details/manifest.json',import.meta.url)));
 const page=await browser.newPage({viewport:{width:1000,height:760}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/WebGLProgram|Feedback loop|GL_INVALID/.test(m.text()))errors.push(m.text());});
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5183/');
 const near=await page.evaluate(async manifest=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {buildNumazuPortScene}=await import('/src/features/exploration/map/three/sceneBuilder.ts');
  const {createPortSky}=await import('/src/features/exploration/map/three/portSky.ts');
  const scene=new THREE.Scene(),sky=createPortSky(scene);let status='loading';
  const model=buildNumazuPortScene(scene,undefined,undefined,s=>status=s);await model.ready;
  const focus=new THREE.Vector3(210,48,-2395),viewer=new THREE.Vector3(220,52,-2395);
  for(let i=0;i<150;i++){model.updateBuildings(focus,viewer);await new Promise(r=>setTimeout(r,100));if(i>25&&!status)break;}
  await model.groundReady();
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(1000,760);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  scene.add(new THREE.AmbientLight(0xf5f0e6,.9));const sun=new THREE.DirectionalLight(0xfff7ed,1.4);sun.position.set(300,500,200);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(45,1000/760,1,55000);camera.position.copy(viewer).add(new THREE.Vector3(20,8,25));camera.lookAt(210,55,-2395);renderer.render(scene,camera);
  const byName=new Map(manifest.entries.map(e=>[e.sourceName,e]));
  function highTextures(){const result=new Set();scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){const d=byName.get(m.map?.name);if(d&&(m.map.image.width>d.baseSize[0]||m.map.image.height>d.baseSize[1]))result.add(m.map);}});return [...result];}
  const high=highTextures();let released=0;high.forEach(t=>t.addEventListener('dispose',()=>released++));
  window.textureCheck={THREE,scene,model,sky,renderer,camera,focus,viewer,highTextures,getReleased:()=>released};
  return {count:high.length,pixels:high.reduce((s,t)=>s+t.image.width*t.image.height,0),textures:high.map(t=>({name:t.name,width:t.image.width,height:t.image.height,flipY:t.flipY})),image:renderer.domElement.toDataURL('image/png').split(',')[1]};
 },manifest);
 assert(near.count>0&&near.count<=3);assert(near.pixels<=3*2048*2048);assert(near.textures.every(t=>t.flipY===false));
 await writeFile('/tmp/shinkai-higher-detail-station.png',Buffer.from(near.image,'base64'));delete near.image;
 const far=await page.evaluate(async()=>{const c=window.textureCheck;await new Promise(r=>setTimeout(r,700));c.model.updateBuildings(c.focus,new c.THREE.Vector3(5000,500,5000));await c.model.groundReady();return {count:c.highTextures().length,released:c.getReleased()};});
 assert.equal(far.count,0);assert.equal(far.released,near.count);
 const restored=await page.evaluate(async()=>{const c=window.textureCheck;await new Promise(r=>setTimeout(r,700));c.model.updateBuildings(c.focus,c.viewer);await c.model.groundReady();const count=c.highTextures().length;c.model.dispose();c.sky.dispose();c.renderer.dispose();return count;});
 assert(restored>0&&restored<=3);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'pass',near,far,restored,errors},null,2));
}finally{await browser.close();}
