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
 page.on('console', message=>{if(/WebGLProgram|GL_INVALID|Feedback loop/.test(message.text()))errors.push(message.text());});
 await page.goto(process.env.APP_URL || 'http://127.0.0.1:5188/');
 const report = await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js');
  const {buildNumazuPortScene}=await import('/src/features/exploration/map/three/sceneBuilder.ts');
  const {createPortSky}=await import('/src/features/exploration/map/three/portSky.ts');
  const {pilotPosition,NEAR_BUILDING_PILOT}=await import('/src/features/exploration/map/three/nearBuildingPilot.ts');
  const scene=new T.Scene(),sky=createPortSky(scene),renderer=new T.WebGLRenderer({antialias:true});
  renderer.setSize(1000,760);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  document.body.replaceChildren(renderer.domElement);document.body.style.margin='0';
  const camera=new T.PerspectiveCamera(50,1000/760,.1,55000),target=pilotPosition().add(new T.Vector3(0,2.9,0));
  const [nx,nz]=NEAR_BUILDING_PILOT.normal;
  camera.position.copy(target).add(new T.Vector3(nx*16.5,1,nz*16.5));camera.lookAt(target);
  scene.add(new T.AmbientLight(0xf5f0e6,.9));const sun=new T.DirectionalLight(0xfff7ed,1.4);sun.position.set(300,500,200);scene.add(sun);
  const fill=new T.DirectionalLight(0x406d8d,.6);fill.position.set(-250,200,-250);scene.add(fill);
  const model=buildNumazuPortScene(scene);await model.ready;
  for(let i=0;i<150;i++){model.updateBuildings(target,camera.position);await new Promise(r=>setTimeout(r,100));if(scene.getObjectByName(NEAR_BUILDING_PILOT.id))break;}
  await model.groundReady();const pilot=scene.getObjectByName(NEAR_BUILDING_PILOT.id);if(!pilot)throw Error('Pilot not streamed');
  model.updateBuildings(target,camera.position);scene.updateMatrixWorld(true);
  const buildings=scene.children.filter(root=>root.userData.buildingHeightScale);
  const ray=new T.Raycaster(target.clone().add(new T.Vector3(nx*19,0,nz*19)),new T.Vector3(-nx,0,-nz));
  const hit=ray.intersectObjects(buildings,true)[0];if(!hit)throw Error('No underlying facade');
  const plane=hit.point.x*nx+hit.point.z*nz;
  const render=()=>{scene.userData.forceReflectionUpdate=true;renderer.render(scene,camera);scene.userData.forceReflectionUpdate=false;};render();
  window.pilotCheck={scene,sky,renderer,camera,target,model,pilot,render};
  return {visible:pilot.visible,draws:pilot.children.length,triangles:pilot.children.reduce((n,m)=>n+m.geometry.index.count/3,0),planeError:Math.abs(plane-NEAR_BUILDING_PILOT.plane)};
 });
 assert(report.visible);assert.equal(report.draws,6);assert(report.triangles<1200);assert(report.planeError<.2);
 await page.screenshot({path:'/tmp/shinkai-near-building-on.png',timeout:90000});
 const lifecycle=await page.evaluate(()=>{
  const x=window.pilotCheck;x.scene.userData.nearBuildingPilot=false;x.model.updateBuildings(x.target,x.camera.position);const off=!x.pilot.visible;x.render();return{off};
 });assert(lifecycle.off);
 await page.screenshot({path:'/tmp/shinkai-near-building-off.png',timeout:90000});
 const release=await page.evaluate(async()=>{
  const x=window.pilotCheck;await new Promise(r=>setTimeout(r,450));x.model.updateBuildings(x.target.clone().set(210,80,-2395));
  const removed=!x.scene.getObjectByName('port-facade-pilot');x.model.dispose();x.sky.dispose();x.renderer.dispose();return removed;
 });assert(release);await page.close();
 const ui=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:.5,reducedMotion:'reduce'});
 ui.setDefaultTimeout(90000);ui.on('pageerror',error=>errors.push(error.message));
 await ui.goto(process.env.APP_URL || 'http://127.0.0.1:5188/');
 await ui.getByRole('button',{name:'本日の標本を引き上げる（1日1回）',exact:true}).click();
 await ui.getByRole('button',{name:'今日の魚を探しに行く',exact:true}).click();
 await ui.locator('.exploration-loading').waitFor({state:'detached'});
 await ui.getByRole('combobox',{name:'移動先',exact:true}).selectOption('pilot');
 const toggle=ui.getByRole('button',{name:'立体の細部 ON',exact:true});await toggle.waitFor();await toggle.click();
 assert.equal(await ui.getByRole('button',{name:'立体の細部 OFF',exact:true}).getAttribute('aria-pressed'),'false');
 await ui.getByRole('button',{name:'立体の細部 OFF',exact:true}).click();
 const fits=await ui.locator('.search-world-toolbar').evaluate(el=>el.scrollWidth<=el.clientWidth);assert(fits);
 await ui.screenshot({path:'/tmp/shinkai-near-building-mobile.png',timeout:90000});
 await ui.getByRole('combobox',{name:'移動先',exact:true}).selectOption('station');
 assert.equal(await ui.locator('.building-pilot-controls').count(),0);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'pass',report,lifecycle,release,mobileToolbarFits:fits,errors},null,2));
} finally { await browser.close(); }
