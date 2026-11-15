// Run against `npm run dev -- --port 5180` with Chromium + Playwright installed.
// Generates real GLB views, never AI-rendered city imagery.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { readFile, writeFile } from 'node:fs/promises';
const places = process.env.FISH_WORLD?JSON.parse(await readFile(new URL('../src/features/exploration/fishWorld.v1.json',import.meta.url))).map(s=>({...s,id:`fish-world-${s.fishId}`})):JSON.parse(await readFile(new URL('../src/features/exploration/hidingPlaces.v1.json', import.meta.url)));
const proxyUrl = process.env.BROWSER_PROXY ? new URL(process.env.BROWSER_PROXY) : null;
const proxy = proxyUrl ? {server:proxyUrl.origin,username:decodeURIComponent(proxyUrl.username),password:decodeURIComponent(proxyUrl.password),bypass:'127.0.0.1,localhost'} : undefined;
const browser = await chromium.launch({proxy,executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const page = await browser.newPage({viewport:{width:1200,height:630}});
  page.on('pageerror', e => console.error(e.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5180/');
  await page.evaluate(async()=>{
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const {buildNumazuPortScene} = await import('/src/features/exploration/map/three/sceneBuilder.ts');
    const {createPortSky} = await import('/src/features/exploration/map/three/portSky.ts');
    const scene = new THREE.Scene();createPortSky(scene);
    const camera = new THREE.PerspectiveCamera(45,1200/630,1,55000);
    const renderer = new THREE.WebGLRenderer({antialias:true});renderer.setSize(1200,630);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
    scene.add(new THREE.AmbientLight(0xf5f0e6,.9));const sun=new THREE.DirectionalLight(0xfff7ed,1.4);sun.position.set(300,500,200);scene.add(sun);const fill=new THREE.DirectionalLight(0x406d8d,.6);fill.position.set(-250,200,-250);scene.add(fill);
    let status='loading';const model=buildNumazuPortScene(scene,undefined,undefined,s=>status=s);await model.ready;
    window.sceneTool={THREE,scene,camera,renderer,model,getStatus:()=>status};
  });
  const report=[];
  for(const place of places.filter(p => !process.env.PLACE_ID || p.id === process.env.PLACE_ID)){
    const result=await page.evaluate(async place=>{
      const {THREE,scene,camera,renderer,model,getStatus}=window.sceneTool;
      const focus=new THREE.Vector3(place.x,50,place.z);
      for(let i=0;i<300;i++){
        model.updateBuildings(focus);
        await new Promise(r=>setTimeout(r,100));
        if(i>25&&!getStatus())break;
      }
      await model.groundReady?.();
      scene.updateMatrixWorld(true);
      const ray=new THREE.Raycaster(new THREE.Vector3(place.x,450,place.z),new THREE.Vector3(0,-1,0));
      const hits=ray.intersectObjects(scene.children,true).filter(h=>h.object.isMesh&&h.object.material?.isMeshStandardMaterial);
      let surfaceY=hits[0]?.point.y ?? null;
      if (surfaceY > (place.y??73)-3 && (!place.medium||place.medium==='air')) {
        throw new Error(`Site overlaps a tall building: ${place.id}. Author a new place version before moving it.`);
      }
      camera.position.set(place.x+200,260,place.z+280);camera.lookAt(place.x,45,place.z);renderer.render(scene,camera);
      const photoTiles = scene.children.filter(o => o.userData.aerialGround).length;
      if (!photoTiles) throw new Error('Aerial photos did not load; keeping existing postcards.');
      return {photoTiles,x:place.x,z:place.z,surfaceY,status:getStatus(),image:renderer.domElement.toDataURL('image/webp',.88).split(',')[1]};
    },place);
    await writeFile(new URL(`../public/map/cards/${place.id}.webp`,import.meta.url),Buffer.from(result.image,'base64'));
    place.x=result.x;place.z=result.z;
    report.push({id:place.id,x:place.x,z:place.z,surfaceY:result.surfaceY,photoTiles:result.photoTiles,status:result.status});
    console.log(JSON.stringify(report.at(-1)));
  }
  await writeFile(new URL(`../public/map/cards/${process.env.FISH_WORLD?'fish-world-validation':'validation'}.json`,import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),note:process.env.FISH_WORLD?'Actual scenery at fish-world-v1 anchors. Water depths are virtual; terrain remains a separate collision layer.':'Top surface raycast, not survey validation. Legacy fish beacons float at ENU y=85.',places:report},null,2)+'\n');
}finally{await browser.close();}
