import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const proxyUrl=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const proxy=proxyUrl?{server:proxyUrl.origin,username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password),bypass:'127.0.0.1,localhost'}:undefined;
const browser=await chromium.launch({proxy,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/WebGLProgram|Feedback loop|GL_INVALID/.test(m.text()))errors.push(m.text());});
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5180/');
 const initial=await page.evaluate(async()=>{
  await import('/src/features/exploration/exploration.css');
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {OrbitControls}=await import('/node_modules/three/examples/jsm/controls/OrbitControls.js');
  const {setupPortFlight}=await import('/src/features/exploration/map/flight/portFlight.ts');
  const {buildNumazuPortScene}=await import('/src/features/exploration/map/three/sceneBuilder.ts');
  const {createPortSky}=await import('/src/features/exploration/map/three/portSky.ts');
  const container=document.createElement('div');container.className='search-map';Object.assign(container.style,{position:'fixed',inset:'0',height:'700px',minHeight:'0',maxHeight:'none',zIndex:'10000'});document.body.appendChild(container);
  const scene=new THREE.Scene();const sky=createPortSky(scene),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(900,700);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;container.appendChild(renderer.domElement);
  const camera=new THREE.PerspectiveCamera(45,900/700,1,55000),controls=new OrbitControls(camera,renderer.domElement);
  const flight=setupPortFlight(container,scene,camera,controls,renderer.domElement,sky.setUnderwater);
  scene.add(new THREE.AmbientLight(0xf5f0e6,.9));const sun=new THREE.DirectionalLight(0xfff7ed,1.4);sun.position.set(300,500,200);scene.add(sun);
  let status='loading';const model=buildNumazuPortScene(scene,undefined,group=>flight.addGeometry(group),s=>status=s);flight.setWaterQuery(model.isWaterAt);await model.ready;
  const focus=new THREE.Vector3(-20,45,-190);model.updateBuildings(focus);await model.groundReady();
  for(let i=0;i<100;i++){model.updateBuildings(focus);await new Promise(r=>setTimeout(r,100));if(i>25&&!status)break;}
  const materials=new Set();scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.isMeshStandardMaterial&&m.emissiveMap&&m.map)materials.add(m);});
  assertLocal(materials.size>0,'No photographic building materials');
  const snapshots=[...materials].map(m=>({m,color:m.emissive.clone(),map:m.emissiveMap,intensity:m.emissiveIntensity,hook:m.onBeforeCompile,key:m.customProgramCacheKey}));
  camera.position.set(380,210,280);camera.lookAt(-20,45,-190);
  const luminance=()=>{scene.userData.forceReflectionUpdate=true;renderer.render(scene,camera);scene.userData.forceReflectionUpdate=false;const gl=renderer.getContext(),data=new Uint8Array(900*700*4);gl.readPixels(0,0,900,700,gl.RGBA,gl.UNSIGNED_BYTE,data);let sum=0;for(let i=0;i<data.length;i+=4)sum+=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722;return sum/(900*700);};
  for(const {m} of snapshots){m.emissive.set(0);m.emissiveMap=null;m.emissiveIntensity=0;m.onBeforeCompile=()=>{};m.customProgramCacheKey=()=> 'reference-building-original';m.needsUpdate=true;}
  const before=luminance();
  for(const s of snapshots){s.m.emissive.copy(s.color);s.m.emissiveMap=s.map;s.m.emissiveIntensity=s.intensity;s.m.onBeforeCompile=s.hook;s.m.customProgramCacheKey=s.key;s.m.needsUpdate=true;}
  const after=luminance();
  const image=renderer.domElement.toDataURL('image/png').split(',')[1];
  const terrain=scene.children.find(o=>o.isGroup&&o.children.some(c=>c.isMesh&&c.material?.color?.getHex()===0xcfc5ae));
  const ray=new THREE.Raycaster();let start;
  for(let z=-300;z<=-100&&!start;z+=15)for(let x=-100;x<=100&&!start;x+=15){
   if(model.isWaterAt(x,z))continue;
   ray.set(new THREE.Vector3(x,300,z),new THREE.Vector3(0,-1,0));
   const ground=ray.intersectObject(terrain,true)[0];if(!ground)continue;
   const solids=ray.intersectObjects(scene.children,true).filter(h=>h.object.material?.isMeshStandardMaterial);
   if(solids[0]&&solids[0].point.y-ground.point.y>.35)continue;
   start={x,y:ground.point.y,z};
  }
  assertLocal(!!start,'No clear ground point for walking');
  flight.setMode(true,new THREE.Vector3(start.x,start.y+5,start.z));
  container.querySelector('[data-dir="-1"]').click();let time=0;
  for(let i=0;i<300&&flight.getStatus().state!=='ground';i++){time+=1/60;flight.update(1/60,time);}
  window.walkingCheck={THREE,scene,renderer,camera,flight,model,sky,time};
  function assertLocal(condition,message){if(!condition)throw new Error(message);}
  return {before,after,materials:materials.size,start,status:flight.getStatus(),image};
 });
 assert(initial.after>initial.before*1.01,'building brightness did not visibly increase');assert.equal(initial.status.state,'ground');
 await writeFile('/tmp/shinkai-brighter-buildings.png',Buffer.from(initial.image,'base64'));delete initial.image;
 assert.equal(await page.locator('.flight-depth').innerText(),'徒歩');
 const pad=await page.locator('.flight-pad').boundingBox();await page.mouse.move(pad.x+pad.width/2,pad.y+pad.height/2-28);await page.mouse.down();
 const walking=await page.evaluate(()=>{
  const c=window.walkingCheck,start=c.flight.getPosition().clone();let grounded=0;
  for(let i=0;i<90;i++){c.time+=1/60;c.flight.update(1/60,c.time);if(c.flight.getStatus().state==='ground')grounded++;}
  const position=c.flight.getPosition(),avatar=c.scene.getObjectByName('HumanoidCharacter');
  c.scene.userData.forceReflectionUpdate=true;c.renderer.render(c.scene,c.camera);c.scene.userData.forceReflectionUpdate=false;
  return {grounded,distance:Math.hypot(position.x-start.x,position.z-start.z),status:c.flight.getStatus(),leg:avatar.getObjectByName('left-leg').rotation.x,image:c.renderer.domElement.toDataURL('image/png').split(',')[1]};
 });
 await page.mouse.up();assert(walking.grounded>80);assert(walking.distance>2.7&&walking.distance<6);assert(Math.abs(walking.leg)>.01);
 await writeFile('/tmp/shinkai-ground-walking.png',Buffer.from(walking.image,'base64'));delete walking.image;
 await page.evaluate(()=>{const c=window.walkingCheck;for(let i=0;i<120;i++){c.time+=1/60;c.flight.update(1/60,c.time);}});
 const rise=page.getByRole('button',{name:'飛び立つ',exact:true});const riseBox=await rise.boundingBox();await page.mouse.move(riseBox.x+riseBox.width/2,riseBox.y+riseBox.height/2);await page.mouse.down();
 const takeoff=await page.evaluate(()=>{const c=window.walkingCheck;for(let i=0;i<30;i++){c.time+=1/60;c.flight.update(1/60,c.time);}return c.flight.getStatus();});await page.mouse.up();assert.equal(takeoff.state,'air');
 await page.evaluate(()=>{const c=window.walkingCheck;c.flight.dispose();c.model.dispose();c.sky.dispose();c.renderer.dispose();});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'pass',initial,walking,takeoff,errors},null,2));
}finally{await browser.close();}
