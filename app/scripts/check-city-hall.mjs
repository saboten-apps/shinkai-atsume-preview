import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const proxy = process.env.BROWSER_PROXY ? new URL(process.env.BROWSER_PROXY) : null;
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,
  proxy:proxy?{server:proxy.origin,username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password),bypass:'127.0.0.1,localhost'}:undefined,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page = await browser.newPage({viewport:{width:1000,height:760}}), errors=[];
 page.on('pageerror', error=>errors.push(error.message));
 page.on('console', message=>{if(message.type()==='error'||message.type()==='warning')console.log(message.text());if(/WebGLProgram|GL_INVALID|Feedback loop/.test(message.text()))errors.push(message.text());});
 await page.goto(process.env.APP_URL || 'http://127.0.0.1:5189/');
 const report = await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js');
  const {buildNumazuPortScene}=await import('/src/features/exploration/map/three/sceneBuilder.ts');
  const {createPortSky}=await import('/src/features/exploration/map/three/portSky.ts');
  const {cityHallPoint,createCityHall}=await import('/src/features/exploration/map/three/cityHall.ts');
  const {Octree}=await import('/node_modules/three/examples/jsm/math/Octree.js');
  const {FreeFlightController}=await import('/src/features/exploration/map/flight/freeFlight.ts');
  const {HumanoidCharacter}=await import('/src/features/exploration/map/flight/character.ts');
  const scene=new T.Scene(),sky=createPortSky(scene),renderer=new T.WebGLRenderer({antialias:true});
  renderer.setSize(1000,760);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  document.body.replaceChildren(renderer.domElement);document.body.style.margin='0';
  const camera=new T.PerspectiveCamera(45,1000/760,.1,55000),target=cityHallPoint(-7,23,3);
  camera.position.copy(cityHallPoint(85,65,125));camera.lookAt(target);
  scene.add(new T.AmbientLight(0xf5f0e6,.9));const sun=new T.DirectionalLight(0xfff7ed,1.4);sun.position.set(300,500,200);scene.add(sun);
  const fill=new T.DirectionalLight(0x406d8d,.6);fill.position.set(-250,200,-250);scene.add(fill);
  const model=buildNumazuPortScene(scene);await model.ready;
  for(let i=0;i<150;i++){model.updateBuildings(target,camera.position);await new Promise(r=>setTimeout(r,100));if(scene.getObjectByName('numazu-city-hall'))break;}
  await model.groundReady();const hall=scene.getObjectByName('numazu-city-hall');if(!hall)throw Error('City hall not streamed');
  model.updateBuildings(target,camera.position);scene.updateMatrixWorld(true);
  const temporary=createCityHall(),tree=new Octree().fromGraphNode(temporary.collider);
  const player=new FreeFlightController(),character=new HumanoidCharacter(),walkCamera=new T.PerspectiveCamera();player.activate(true);const spawn=cityHallPoint(0,3,36);player.teleport(spawn.x,spawn.y,spawn.z);player.setWaterQuery(()=>false);
  for(let i=0;i<180;i++)player.update(1/60,[tree],character,walkCamera,i/60,null,true);
  const groundedBefore=player.state==='ground',start=player.position.clone();player.setLookDegrees(-.347*180/Math.PI,0);player.setStick(0,1);
  for(let i=0;i<90;i++)player.update(1/60,[tree],character,walkCamera,i/60);
  const walkDistance=player.position.distanceTo(start),groundedAfter=player.state==='ground';
  // Ground is a separate scene mesh; check roof clearance with a horizontal ray
  // and that the roof and columns remain solid in the standalone collider.
  const ray=new T.Raycaster(cityHallPoint(0,2,40),cityHallPoint(0,2,25).sub(cityHallPoint(0,2,40)).normalize(),0,12);
  const passage=ray.intersectObject(temporary.collider,true).length===0;
  const roofRay=new T.Raycaster(cityHallPoint(0,5,33),new T.Vector3(0,1,0));
  const roofSolid=roofRay.intersectObject(temporary.collider,true).length>0;
  const columnRay=new T.Raycaster(cityHallPoint(12,3,45),cityHallPoint(12,3,39).sub(cityHallPoint(12,3,45)).normalize(),0,10);
  const columnSolid=columnRay.intersectObject(temporary.collider,true).length>0;
  const photoReady=hall.userData.photoState==='ready',photoTextures=hall.userData.photoTextures;
  const photoMeshes=hall.getObjectByName('city-hall-photographs').children;
  const photoSizes=photoMeshes.map(m=>[m.material.map.image.width,m.material.map.image.height]);
  const detail=hall.getObjectByName('city-hall-near-details');model.updateBuildings(target,cityHallPoint(0,200,500));const farHidden=!detail.visible,farPhotosReleased=hall.userData.photoTextures===0;model.updateBuildings(target,camera.position);await model.groundReady();
  const photosReloaded=hall.userData.photoState==='ready';
  const triangles=hall.children.reduce((n,o)=>n+(o.isMesh?o.geometry.index.count/3:o.children.reduce((n,m)=>n+m.geometry.index.count/3,0)),0);
  temporary.dispose();
  const render=()=>{scene.userData.forceReflectionUpdate=true;renderer.render(scene,camera);scene.userData.forceReflectionUpdate=false;};render();
  window.hallCheck={scene,sky,renderer,camera,target,model,hall,render};
  return {source:hall.userData.replacedSource,triangles,passage,roofSolid,columnSolid,farHidden,groundedBefore,groundedAfter,walkDistance,photoReady,photoTextures,photoSizes,farPhotosReleased,photosReloaded};
 });
 assert.equal(report.source.components,2);assert(report.photoReady);assert(report.farPhotosReleased);assert(report.photosReloaded);assert.equal(report.photoTextures,4);assert.deepEqual(report.photoSizes,[[1024,512],[1024,256],[256,1024],[1024,512]]);assert(report.source.triangles>100);assert(report.passage);assert(report.roofSolid);assert(report.columnSolid);assert(report.farHidden);assert(report.groundedBefore);assert(report.groundedAfter);assert(report.walkDistance>4);assert(report.triangles<25000);
 await page.screenshot({path:'/tmp/shinkai-city-hall.png',timeout:90000});
 await page.evaluate(()=>{const x=window.hallCheck;const angle=.347,c=Math.cos(angle),s=Math.sin(angle);const p=(xx,y,z)=>new x.camera.position.constructor(548.5+c*xx+s*z,43.35+y,-1567-s*xx+c*z);x.camera.position.copy(p(0,2.5,37));x.camera.lookAt(p(-6,2.4,24));x.render();});
 await page.screenshot({path:'/tmp/shinkai-city-hall-entry.png',timeout:90000});
 const release=await page.evaluate(async()=>{
  const x=window.hallCheck;await new Promise(r=>setTimeout(r,450));x.model.updateBuildings(x.target.clone().set(-300,80,300));
  const removed=!x.scene.getObjectByName('numazu-city-hall');x.model.dispose();x.sky.dispose();x.renderer.dispose();return removed;
 });assert(release);await page.close();
 const ui=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:.5,reducedMotion:'reduce'});
 ui.setDefaultTimeout(90000);ui.on('pageerror',error=>errors.push(error.message));
 await ui.goto(process.env.APP_URL || 'http://127.0.0.1:5189/');
 await ui.getByRole('button',{name:'本日の標本を引き上げる（1日1回）',exact:true}).click();
 await ui.getByRole('button',{name:'今日の魚を探しに行く',exact:true}).click();
 await ui.locator('.exploration-loading').waitFor({state:'detached'});
 await ui.getByRole('combobox',{name:'移動先',exact:true}).selectOption('cityhall');
 const fits=await ui.locator('.search-world-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth);assert(fits);
 await ui.screenshot({path:'/tmp/shinkai-city-hall-mobile.png',timeout:90000});
 await ui.getByRole('combobox',{name:'移動先',exact:true}).selectOption('station');
 assert.equal(await ui.locator('.building-pilot-controls').count(),0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'pass',report,release,mobileToolbarFits:fits,errors},null,2));
} finally { await browser.close(); }
