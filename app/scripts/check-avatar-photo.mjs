import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.APP_URL||'http://127.0.0.1:5191/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const gallery=await browser.newPage({viewport:{width:960,height:400}});await gallery.goto(base);
 const render=await gallery.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');const {HumanoidCharacter}=await import('/src/features/exploration/map/flight/character.ts');
  const scene=new THREE.Scene();scene.background=new THREE.Color('#173747');scene.add(new THREE.HemisphereLight(0xffffff,0x6f8795,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-4,5,-5);scene.add(light);
  const poses=['wave','cheer','salute','natural'];const ids=['mendako','jellyfish','angler','mendako'];const actors=[];
  for(let i=0;i<4;i++){const c=new HumanoidCharacter();c.setAvatar(ids[i]);c.setVisible(true);c.group.position.set((i-1.5)*2.2,0,0);if(i===3)c.setVehicle('submarine');c.applyPhotoPose(poses[i],0);scene.add(c.group);actors.push(c);}
  const camera=new THREE.PerspectiveCamera(28,960/400,.1,100);camera.position.set(0,2.4,-10.5);camera.lookAt(0,.8,0);const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(960,400);renderer.render(scene,camera);const result={image:renderer.domElement.toDataURL(),draws:renderer.info.render.calls,triangles:renderer.info.render.triangles};actors.forEach(c=>c.dispose());renderer.dispose();return result;
 });await fs.writeFile('/tmp/shinkai-avatar-lineup.png',Buffer.from(render.image.split(',')[1],'base64'));delete render.image;console.log('PASS avatar gallery',render);await gallery.close();
 const page=await browser.newPage({viewport:{width:412,height:820},deviceScaleFactor:.5});page.setDefaultTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('shinkai-scenery-atmosphere-v1',JSON.stringify({time:'day',season:'summer'}));});
 await page.goto(base+'#/view/harbor-life');await page.getByRole('button',{name:'3Dで景色を見る',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.scenery-photo-trigger')&&!document.querySelector('.scenery-photo-trigger').disabled);
 await page.locator('.world-travel>summary').click();await page.getByRole('combobox',{name:'キャラクター',exact:true}).selectOption('jellyfish');assert.equal(await page.evaluate(()=>localStorage.getItem('shinkai-avatar-v1')),'jellyfish');
 await page.getByRole('button',{name:'港の乗り場で潜水艇に乗る',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.flight-depth')?.textContent?.includes('潜水艇'));console.log('PASS selected diver and boarded underwater');
 await page.getByRole('button',{name:'景色を撮る',exact:true}).click();const setup=page.getByRole('dialog',{name:'撮影の準備',exact:true});await setup.waitFor();await page.getByRole('combobox',{name:'撮影ポーズ',exact:true}).selectOption('cheer');await page.screenshot({path:'/tmp/shinkai-avatar-photo-setup.png'});
 const before=await page.locator('.flight-depth').innerText();await page.keyboard.press('KeyE');assert.equal(await page.locator('.flight-depth').innerText(),before);await page.getByRole('button',{name:'この構図で撮る',exact:true}).click();await page.getByRole('dialog',{name:'撮影した景色',exact:true}).waitFor();await page.locator('.scenery-photo-preview').evaluate(image=>image.decode());await page.screenshot({path:'/tmp/shinkai-submarine-photo.png'});console.log('PASS posed photo capture');await page.getByRole('button',{name:'街に戻る',exact:true}).click();assert.equal(await setup.count(),0);
 await page.locator('.world-travel>summary').click();await page.getByRole('button',{name:'潜水艇から降りる',exact:true}).click();await page.locator('.world-travel>summary').click();await page.waitForFunction(()=>!document.querySelector('.flight-depth')?.textContent?.includes('潜水艇'));console.log('PASS leave submarine');
 await page.locator('.world-travel>summary').click();await page.getByRole('button',{name:'港の車乗り場からドライブ',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.flight-depth')?.textContent?.includes('ミニカー'),null,{timeout:60000});
 assert(await page.locator('.flight-vertical [data-dir="1"]').isDisabled());await page.keyboard.down('KeyW');
 await page.waitForFunction(()=>/ミニカー · [1-9]\d*km/.test(document.querySelector('.flight-depth')?.textContent??''));await page.keyboard.up('KeyW');
 await page.waitForFunction(()=>document.querySelector('.flight-depth')?.textContent?.includes('ミニカー · 0km/h'));console.log('PASS car boarding, drive and stop');
 await page.getByRole('button',{name:'景色を撮る',exact:true}).click();await page.getByRole('combobox',{name:'撮影ポーズ',exact:true}).selectOption('wave');await page.screenshot({path:'/tmp/shinkai-car-photo-setup.png'});await page.getByRole('button',{name:'この構図で撮る',exact:true}).click();await page.getByRole('dialog',{name:'撮影した景色',exact:true}).waitFor();await page.getByRole('button',{name:'街に戻る',exact:true}).click();
 await page.locator('.world-travel>summary').click();await page.getByRole('button',{name:'車から降りる',exact:true}).click();await page.locator('.world-travel>summary').click();await page.waitForFunction(()=>!document.querySelector('.flight-depth')?.textContent?.includes('ミニカー'));console.log('PASS car photo and dismount');
 assert.deepEqual(errors,[]);await fs.writeFile('/tmp/shinkai-avatar-photo-check.json',JSON.stringify({gallery:render,character:'jellyfish',boarded:true,posedPhoto:true,leftVehicle:true,car:{boarded:true,drove:true,stopped:true,posedPhoto:true,left:true},errors},null,2));await page.close();
}finally{await browser.close();}
