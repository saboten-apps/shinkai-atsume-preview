import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');const proxy=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',proxy:proxy?{server:proxy.origin,username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password),bypass:'127.0.0.1,localhost'}:undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:.5});page.setDefaultTimeout(120000);let requests=[];page.on('request',r=>requests.push(r.url()));
await page.goto((process.env.APP_URL||'http://127.0.0.1:5190/')+'#/view/city-hall',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'3Dで景色を見る'}).click();
await page.getByRole('combobox',{name:'移動先'}).waitFor();await page.waitForFunction(()=>{let s=document.querySelector('select[aria-label="移動先"]');return s&&!s.disabled;});
await page.getByRole('combobox',{name:'移動先'}).selectOption('cityhall');await page.waitForTimeout(7000);
assert(!requests.some(u=>/buildings-.*json/.test(u)),'sidecars loaded before hold');
const canvas=page.locator('.search-world-canvas canvas'),box=await canvas.boundingBox();
await page.mouse.click(box.x+box.width*.5,box.y+box.height*.5);assert.equal(await page.locator('.building-selection-card').count(),0,'short click selected building');
for(const [x,y] of [[.5,.5],[.45,.4],[.55,.4],[.4,.5],[.6,.5],[.5,.3],[.35,.6],[.65,.6]]){await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();await page.waitForTimeout(1200);if(await page.locator('.building-selection-card').count())break;}
assert.equal(await page.locator('.building-selection-card').count(),1,'long press did not select');assert(requests.some(u=>/buildings-.*json/.test(u)));console.log('PASS short tap / long press selects building / sidecar lazy loads');
await page.locator('.building-selection-card .close-button').click();
await page.getByRole('button',{name:'飛んでみる',exact:true}).click();
await page.getByRole('button',{name:'マップに戻る',exact:true}).waitFor();await page.waitForTimeout(3500);
for(const [x,y] of [[.5,.5],[.45,.45],[.55,.45],[.4,.55],[.6,.55],[.3,.45],[.7,.45],[.5,.7],[.25,.6],[.75,.6]]){await page.mouse.move(box.x+box.width*x,box.y+box.height*y);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();await page.waitForTimeout(900);if(await page.locator('.building-selection-card').count())break;}
assert.equal(await page.locator('.building-selection-card').count(),1,'flight long press did not select');assert(await page.getByRole('button',{name:'マップに戻る',exact:true}).isVisible(),'flight exited');console.log('PASS long press in flight keeps flight active');
}finally{await browser.close();}
