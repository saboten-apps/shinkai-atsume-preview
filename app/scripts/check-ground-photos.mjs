import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const proxyUrl=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const proxy=proxyUrl?{server:proxyUrl.origin,username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password),bypass:'127.0.0.1,localhost'}:undefined;
const browser=await chromium.launch({proxy,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1200,height:760}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&m.text().includes('WebGLProgram'))errors.push(m.text());});
  await page.goto(process.env.APP_URL||'http://127.0.0.1:5180/');
  await page.evaluate(async()=>{
    const THREE=await import('/node_modules/.vite/deps/three.js');
    const {buildNumazuPortScene}=await import('/src/features/exploration/map/three/sceneBuilder.ts');
    const scene=new THREE.Scene();scene.add(new THREE.AmbientLight(0xffffff,1));
    const model=buildNumazuPortScene(scene);await model.ready;
    const renderer=new THREE.WebGLRenderer();renderer.setSize(1200,760);
    const camera=new THREE.PerspectiveCamera(45,1200/760,1,55000);
    window.groundCheck={THREE,scene,model,renderer,camera,buildNumazuPortScene};
  });
  const report=[];
  for(const point of [{x:-20,z:-190},{x:210,z:-2395}]) {
    const result=await page.evaluate(async p=>{
      const {THREE,scene,model,renderer,camera}=window.groundCheck;
      const before=scene.children.filter(o=>o.userData.aerialGround);
      let released=0;
      for(const o of before)o.material.map.addEventListener('dispose',()=>released++);
      model.updateBuildings(new THREE.Vector3(p.x,45,p.z));await model.groundReady();
      const tiles=scene.children.filter(o=>o.userData.aerialGround);
      camera.position.set(p.x+200,300,p.z+280);camera.lookAt(p.x,45,p.z);renderer.render(scene,camera);
      const screenshot=renderer.domElement.toDataURL('image/png');
      return {point:p,overview:tiles.filter(o=>o.name.startsWith('gsi-photo-15/')).length,detail:tiles.filter(o=>o.name.startsWith('gsi-photo-18/')).length,widths:[...new Set(tiles.map(o=>o.material.map.image.width))],released,exportBytes:screenshot.length};
    },point);
    assert(result.overview>0,'overview photographs did not load');
    assert(result.detail>0&&result.detail<=32,'detail tile budget exceeded or no detail photographs loaded');
    assert.deepEqual(result.widths,[256]);assert(result.exportBytes>1000,'CORS-safe scene export failed');
    if(report.length)assert(result.released>0,'port detail textures did not release at the station');
    report.push(result);
  }
  await page.evaluate(()=>{window.groundCheck.model.dispose();window.groundCheck.renderer.dispose();});
  let blocked=0;
  await page.route('**/xyz/seamlessphoto/**',route=>{blocked++;return route.abort();});
  const fallback=await page.evaluate(async()=>{
    const {THREE,buildNumazuPortScene}=window.groundCheck;
    const scene=new THREE.Scene(),model=buildNumazuPortScene(scene);await model.ready;
    model.updateBuildings(new THREE.Vector3(-20,42,-190));await model.groundReady();
    const photos=scene.children.filter(o=>o.userData.aerialGround).length;
    const terrainExists=scene.children.some(o=>o.isGroup&&o.children.some(c=>c.isMesh&&c.material?.color?.getHex()===0xcfc5ae));
    model.dispose();return {photos,terrainExists};
  });
  assert(blocked>0);assert.equal(fallback.photos,0);assert(fallback.terrainExists,'neutral terrain missing after photo failure');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'pass',report,fallback,errors},null,2));
}finally{await browser.close();}
