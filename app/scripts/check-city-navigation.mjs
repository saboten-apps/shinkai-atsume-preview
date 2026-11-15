import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const p=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const browser=await chromium.launch({proxy:p?{server:p.origin,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password),bypass:'127.0.0.1,localhost'}:undefined,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/WebGLProgram|GL_INVALID|Feedback loop/.test(m.text()))errors.push(m.text());});
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5180/');
 const report=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js');
  const {Octree}=await import('/node_modules/three/examples/jsm/math/Octree.js');
  const {buildNumazuPortScene}=await import('/src/features/exploration/map/three/sceneBuilder.ts');
  const {createPortSky}=await import('/src/features/exploration/map/three/portSky.ts');
  const {FreeFlightController}=await import('/src/features/exploration/map/flight/freeFlight.ts');
  const {HumanoidCharacter}=await import('/src/features/exploration/map/flight/character.ts');
  const {FISH_SITES}=await import('/src/features/exploration/fishWorld.ts');
  const data=await (await fetch('/src/features/exploration/cityStructures.v1.json')).json();
  const water=await (await fetch('/src/features/exploration/waterOutline.v1.json')).json();
  const scene=new T.Scene(),sky=createPortSky(scene),renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1000,760);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.replaceChildren(renderer.domElement);
  const camera=new T.PerspectiveCamera(45,1000/760,1,55000);scene.add(new T.AmbientLight(0xf5f0e6,.9));const sun=new T.DirectionalLight(0xfff7ed,1.4);sun.position.set(300,500,200);scene.add(sun);
  let status='loading';const model=buildNumazuPortScene(scene,undefined,undefined,text=>status=text);await model.ready;
  const focus=new T.Vector3(385,50,-397);for(let i=0;i<180;i++){model.updateBuildings(focus);await new Promise(r=>setTimeout(r,100));if(i>20&&!status)break;}
  await model.groundReady();scene.updateMatrixWorld(true);
  const roots=scene.children.filter(o=>o.userData.buildingHeightScale);if(!roots.length)throw new Error('No emphasized buildings');
  const bridge=scene.getObjectByName('bridge-minato'),top=bridge.userData.deckY;
  const tree=new Octree().fromGraphNode(bridge),player=new FreeFlightController(),character=new HumanoidCharacter(),walkCam=new T.PerspectiveCamera();player.activate(true);player.teleport(385.855,top+3,-397.595);player.setWaterQuery(model.isWaterAt);
  for(let i=0;i<180;i++)player.update(1/60,[tree],character,walkCam,i/60,null,true);
  if(player.state!=='ground')throw new Error('Bridge cannot be landed on');
  const source=data.bridges.find(b=>b.id==='minato');player.setLookDegrees(Math.atan2(source.b.x-source.a.x,-(source.b.z-source.a.z))*180/Math.PI,0);player.setStick(0,1);const start=player.position.clone();let grounded=0;
  for(let i=0;i<150;i++){player.update(1/60,[tree],character,walkCam,i/60);if(player.state==='ground')grounded++;}
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),sea=new Path2D(water.sea),river=new Path2D(water.river);
  const dry=FISH_SITES.filter(site=>site.medium!=='air'&&!ctx.isPointInPath(sea,site.x,site.z,'evenodd')&&!ctx.isPointInPath(river,site.x,site.z,'evenodd')).map(s=>s.fishId);

  camera.position.set(bridge.position.x+90,90,bridge.position.z+130);camera.lookAt(bridge.position.x,top,bridge.position.z);scene.userData.forceReflectionUpdate=true;renderer.render(scene,camera);scene.userData.forceReflectionUpdate=false;
  window.cityCheck={scene,sky,renderer,model,camera};return {bridges:scene.getObjectByName('city-bridges').children.filter(o=>o.userData.bridgeId).length,scales:roots.map(o=>o.userData.buildingHeightScale),components:roots.reduce((n,o)=>n+o.userData.heightComponents,0),bridgePassages:data.bridges.map(b=>model.isWaterAt(b.center.x,b.center.z)),bridgeDeckY:top,walkDistance:player.position.distanceTo(start),grounded,dry};
 });
 assert.equal(report.bridges,4);assert(report.bridgePassages.every(Boolean));assert(report.scales.every(s=>s===1.3));assert(report.components>0);assert(report.grounded>140);assert(report.walkDistance>8);assert.deepEqual(report.dry,[]);
 await page.screenshot({path:'/tmp/shinkai-detailed-bridge.png',timeout:90000});
 await page.evaluate(()=>{const x=window.cityCheck;x.model.dispose();x.sky.dispose();x.renderer.dispose();});await page.close();
 const ui=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:.5,reducedMotion:'reduce'});ui.setDefaultTimeout(60000);ui.on('pageerror',e=>errors.push(e.message));
 await ui.goto(process.env.APP_URL||'http://127.0.0.1:5180/');await ui.getByRole('button',{name:'本日の標本を引き上げる（1日1回）',exact:true}).click();await ui.getByRole('button',{name:'今日の魚を探しに行く',exact:true}).click();await ui.locator('.exploration-loading').waitFor({state:'detached',timeout:90000});
 await ui.waitForFunction(()=>document.querySelector('[data-compass-heading]')?.textContent?.length>0);
 const nav=await ui.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js'),{createNavigationHud}=await import('/src/features/exploration/map/three/navigationHud.ts');const root=document.querySelector('.world-navigation'),camera=new T.PerspectiveCamera(45,root.clientWidth/root.clientHeight,1,55000),nav=createNavigationHud(root,camera,false),point=new T.Vector3(385,50,-397);
  camera.position.set(385,100,-200);camera.lookAt(385,100,-500);nav.update(camera.position,true);const north=root.querySelector('[data-compass-heading]').textContent;
  camera.lookAt(600,100,-200);nav.update(camera.position,true);const east=root.querySelector('[data-compass-heading]').textContent;
  camera.position.set(385,130,-100);camera.lookAt(385,59,-397);nav.update(camera.position,true);const labels=[...root.querySelectorAll('.world-landmark-label:not([hidden])')].map(e=>e.innerText);nav.update(camera.position,false);const hidden=[...root.querySelectorAll('.world-landmark-label')].every(e=>e.hidden);return{north,east,labels,hidden};
 });
 assert.equal(nav.north,'北');assert.equal(nav.east,'東');assert(nav.labels.some(s=>s.includes('港大橋')));assert(nav.labels.length<=3);assert(nav.hidden);
 await ui.getByRole('button',{name:'目印',exact:true}).click();assert.equal(await ui.getByRole('button',{name:'目印',exact:true}).getAttribute('aria-pressed'),'false');assert(await ui.locator('.world-compass').isVisible());
 await ui.screenshot({path:'/tmp/shinkai-city-compass-mobile.png',timeout:90000});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'pass',report,nav,errors},null,2));
}finally{await browser.close();}
