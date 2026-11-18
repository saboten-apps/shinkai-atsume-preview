import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=createRequire(import.meta.url)('playwright');
const proxyURL=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',proxy:proxyURL?{server:proxyURL.origin,username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password),bypass:'127.0.0.1,localhost'}:undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const output=process.env.OUTPUT_DIR||'/tmp/shinkai-hud';await mkdir(output,{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:412,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
 page.setDefaultTimeout(90000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5193/');
 await page.getByRole('button',{name:'釣り糸を垂らす',exact:true}).click();
 await page.getByRole('button',{name:'今日の魚を探しに行く',exact:true}).click();
 await page.locator('.exploration-loading').waitFor({state:'detached'});
 await page.locator('.flight-pad:not([hidden])').waitFor();
 await page.waitForTimeout(3000);
 const layouts=[];
 for(const viewport of [{width:412,height:800},{width:360,height:640},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.waitForFunction(()=>{const r=document.querySelector('.search-map canvas').getBoundingClientRect();return Math.abs(r.height-innerHeight)<1&&Math.abs(r.width-innerWidth)<1;});
  const layout=await page.evaluate(()=>{
   const canvas=document.querySelector('.search-map canvas').getBoundingClientRect();
   const selectors=['.search-toolbar>.hud-icon-button:first-child','.search-menu-button','.search-flight-button','.world-travel>summary','.flight-pad','.flight-vertical button[data-dir="1"]','.flight-vertical button[data-dir="-1"]','.scenery-photo-trigger',...(document.querySelector('.search-low-fps')?['.search-low-fps']:[])];
   const controls=selectors.map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{selector,x:r.x,y:r.y,width:r.width,height:r.height,reachable:el===hit||el.contains(hit)};});
   return {viewport:{width:innerWidth,height:innerHeight},canvas:{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height},controls};
  });
  assert.equal(layout.canvas.y,0);assert.equal(layout.canvas.height,viewport.height);assert.equal(layout.canvas.width,viewport.width);
  for(const c of layout.controls){assert(c.width>=44&&c.height>=44,`small target ${c.selector}`);assert(c.reachable,`blocked control ${c.selector}`);assert(c.x>=0&&c.y>=0&&c.x+c.width<=viewport.width+.5&&c.y+c.height<=viewport.height+.5,`clipped control ${c.selector}`);}
  assert(await page.locator('.shared-exploration-launch').isHidden(),'unconfigured multiplayer must not clutter scene');
  assert.equal(await page.locator('.search-discover button:disabled').count(),0,'no disabled distant-discovery CTA in canvas');
  layouts.push(layout);
  await page.screenshot({path:`${output}/exploration-${viewport.width}x${viewport.height}.png`});
 }
 await page.setViewportSize({width:412,height:800});
 const arrowBefore=await page.locator('.detector-arrow>span').getAttribute('style');
 await page.mouse.move(200,300);await page.mouse.down();await page.mouse.move(260,300,{steps:5});await page.mouse.up();
 await page.waitForFunction(before=>document.querySelector('.detector-arrow>span').getAttribute('style')!==before,arrowBefore);
 await page.getByRole('button',{name:'案内・設定',exact:true}).click();
 const menu=page.getByRole('dialog',{name:'表示と操作',exact:true});await menu.waitFor();
 assert(await menu.evaluate(el=>el.contains(document.activeElement)),'focus is inside modal');
 await page.screenshot({path:`${output}/exploration-menu.png`});
 await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
 assert(await page.locator('.search-menu-button').evaluate(el=>el===document.activeElement),'focus restored to menu trigger');
 await page.locator('.world-travel>summary').click();
 const travelBox=await page.locator('.world-travel-sheet').boundingBox();assert(travelBox.x>=0&&travelBox.x+travelBox.width<=412,'destination menu fits viewport');
 await page.getByLabel('移動先',{exact:true}).selectOption('port');
 assert(!(await page.locator('.world-travel').evaluate(el=>el.open)));
 await page.getByRole('button',{name:'飛んでみる',exact:true}).click();
 await page.getByRole('button',{name:'景色を撮る',exact:true}).click();await page.getByRole('button',{name:'この構図で撮る',exact:true}).click();
 await page.getByRole('dialog',{name:'撮影した景色',exact:true}).waitFor();
 await page.getByRole('button',{name:'街に戻る',exact:true}).click();
 await page.getByRole('button',{name:'案内・設定',exact:true}).click();
 await menu.getByRole('button',{name:'2D 軽い地図',exact:true}).click();
 await page.locator('.search-2d svg').waitFor();assert.equal(await page.locator('.search-map canvas').count(),0);
 assert(!await page.locator('.app-header').evaluate(el=>el.inert),'2D header restored');
 const base=(process.env.APP_URL||'http://127.0.0.1:5193/');
 await page.goto(base+'#/view/port');await page.getByRole('button',{name:'3Dで景色を見る',exact:true}).click();
 await page.getByRole('button',{name:'飛んでみる',exact:true}).waitFor();
 await page.getByRole('button',{name:'案内・設定',exact:true}).click();await menu.waitFor();
 await menu.getByRole('button',{name:'2Dで場所を見る',exact:true}).click();
 await page.locator('.scenery-location svg').waitFor();
 assert.deepEqual(errors,[]);
 await writeFile(`${output}/layout.json`,JSON.stringify(layouts,null,2));
 console.log('PASS full-viewport canvas, reachable 44px controls at three sizes, modal focus/Escape, destination/fly, photo, 2D fallback and scenery menu. No page errors.');
 console.log(output);
} catch(error){console.error(error);throw error;} finally {await browser.close();}
