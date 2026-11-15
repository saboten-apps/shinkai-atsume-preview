import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const p=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const browser=await chromium.launch({proxy:p?{server:p.origin,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password),bypass:'127.0.0.1,localhost'}:undefined,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:900,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/WebGLProgram|GL_INVALID|Feedback loop/.test(m.text()))errors.push(m.text());});
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5180/');
 const report=await page.evaluate(async()=>{
  const T=await import('/node_modules/.vite/deps/three.js');
  const {buildNumazuPortScene}=await import('/src/features/exploration/map/three/sceneBuilder.ts');
  const {createPortSky}=await import('/src/features/exploration/map/three/portSky.ts');
  const {createWorldFish}=await import('/src/features/exploration/map/three/worldFish.ts');
  const {FISH_SITES}=await import('/src/features/exploration/fishWorld.ts');
  const scene=new T.Scene(),sky=createPortSky(scene),camera=new T.PerspectiveCamera(45,900/700,1,55000);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(900,700);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;document.body.replaceChildren(renderer.domElement);
  scene.add(new T.AmbientLight(0xf5f0e6,.9));const light=new T.DirectionalLight(0xfff7ed,1.4);light.position.set(100,500,100);scene.add(light);
  const model=buildNumazuPortScene(scene);await model.ready;
  const dry=FISH_SITES.filter(s=>s.medium!=='air'&&!model.isWaterAt(s.x,s.z));
  const blocked=[];scene.updateMatrixWorld(true);
  for(const site of FISH_SITES.filter(s=>s.medium!=='air')){
    const hits=new T.Raycaster(new T.Vector3(site.x,100,site.z),new T.Vector3(0,-1,0)).intersectObjects(scene.children,true).filter(h=>h.object.material?.isMeshStandardMaterial&&!h.object.userData.waterTerrain&&!h.object.userData.virtualWaterBed&&!h.object.userData.regionalLandscape);
    if(hits.some(h=>h.point.y>site.y))blocked.push(site.fishId);
  }
  const site=FISH_SITES.find(s=>s.fishId==='f03'),world=createWorldFish(scene,'f03',site,'ja');
  world.update(0,new T.Vector3(10000,10000,10000),false,true);const far=world.root.getObjectByName('today-fish-glow').visible;
  world.update(0,new T.Vector3(site.x,site.y,site.z+35),false,true);const near=world.root.getObjectByName('today-fish-glow').userData.strength;
  const fish=world.root.children.filter(o=>o.userData.fishId);
  const bright=fish.filter(o=>o.children[0].material.emissiveIntensity>.1).map(o=>o.userData.fishId);
  sky.setUnderwater(true);camera.position.set(site.x+12,site.y+1.8,site.z+17);camera.lookAt(world.targetPosition);world.update(0,camera.position,false,true);renderer.render(scene,camera);
  window.fishTool={model,world,sky,renderer};
  return {fishCount:fish.length,dry,blocked,far,near,bright,drawCalls:renderer.info.render.calls};
 });
 console.log(JSON.stringify({stage:'models',report}));
 assert.equal(report.fishCount,24);assert.deepEqual(report.dry,[]);assert.deepEqual(report.blocked,[]);assert.equal(report.far,false);assert(report.near>0);assert.deepEqual(report.bright,['f03']);
 await page.screenshot({path:'/tmp/shinkai-river-fish.png'});
 await page.evaluate(()=>{const x=window.fishTool;x.world.dispose();x.model.dispose();x.sky.dispose();x.renderer.dispose();});await page.close();
 const ui=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:.5,reducedMotion:'reduce'});
 ui.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});ui.on('console',m=>{if(/WebGL|context|Raycaster/.test(m.text()))console.log(m.type(),m.text());});
 await ui.clock.setFixedTime(new Date('2026-11-14T03:00:00Z'));
 await ui.goto(process.env.APP_URL||'http://127.0.0.1:5180/');
 await ui.getByRole('button',{name:'本日の標本を引き上げる（1日1回）',exact:true}).click();
 await ui.getByRole('button',{name:'軽い2D地図で探す',exact:true}).click();
 const svg=ui.locator('.search-2d svg');await svg.scrollIntoViewIfNeeded();
 assert.equal(await ui.locator('[data-fish-id]').count(),24);
 const point=await svg.evaluate(el=>{const p=new DOMPoint(25,180).matrixTransform(el.getScreenCTM());return{x:p.x,y:p.y};});await ui.mouse.click(point.x,point.y);
 assert.equal(await ui.locator('[data-today-glow]').count(),1);
 await ui.getByRole('button',{name:'3D',exact:true}).click();
 await ui.locator('.exploration-loading').waitFor({state:'detached',timeout:90000});console.log('UI 3D ready');
 assert(await ui.getByRole('button',{name:'魚を発見する！',exact:true}).isDisabled(),'underwater fish can be found from overhead');
 await ui.getByRole('button',{name:'飛んでみる',exact:true}).click();
 await ui.getByRole('button',{name:'落下',exact:true}).click({force:true});console.log('Falling');
 await ui.waitForTimeout(1500);console.log('Fall status',await ui.locator('.flight-depth').innerText(),await ui.locator('.search-detector').innerText(),await ui.locator('.flight-vertical').innerText());
 try{await ui.getByRole('button',{name:'潜る',exact:true}).waitFor({timeout:90000});}catch(error){console.error('Water entry failed',errors,await ui.locator('body').innerText());await ui.screenshot({path:'/tmp/shinkai-dive-failure.png'});throw error;}
 console.log('Water reached');
 const dive=await ui.getByRole('button',{name:'潜る',exact:true}).boundingBox();await ui.mouse.move(dive.x+dive.width/2,dive.y+dive.height/2);await ui.mouse.down();
 try{await ui.waitForFunction(()=>{const t=document.querySelector('.flight-depth')?.textContent;return t?.includes('水深')&&Number(t.match(/[\d.]+/)?.[0])>=6;},{},{timeout:30000});}catch(error){console.error('Dive failed',errors,await ui.locator('body').innerText());await ui.screenshot({path:'/tmp/shinkai-dive-failure.png'});throw error;}finally{await ui.mouse.up();}
 console.log('Dived',await ui.locator('.flight-depth').innerText());
 await ui.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='魚を発見する！'&&!b.disabled),{},{timeout:30000});
 await ui.screenshot({path:'/tmp/shinkai-dive-fish-mobile.png'});
 await ui.getByRole('button',{name:'魚を発見する！',exact:true}).click({timeout:90000});
 await ui.getByRole('button',{name:'景色入りカードを作る',exact:true}).click();await ui.locator('.discovery-card-preview').waitFor({timeout:20000});
 await ui.getByRole('button',{name:'3Dの街に戻る',exact:true}).click();await ui.locator('.exploration-loading').waitFor({state:'detached',timeout:90000});await ui.getByRole('button',{name:'発見カードを見る',exact:true}).waitFor();
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'pass',report,errors,checks:['24 species','water sites in real water polygons','only target glows nearby','no distant beacon','2D same fish','must dive to discover underwater fish','dive button works','underwater discovery card','return to city after underwater discovery']},null,2));
}finally{await browser.close();}
