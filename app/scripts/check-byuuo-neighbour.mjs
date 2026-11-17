import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const proxy=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',proxy:proxy?{server:proxy.origin,username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password),bypass:'127.0.0.1,localhost'}:undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:.5});page.setDefaultTimeout(120000);
 await page.goto((process.env.APP_URL||'http://127.0.0.1:5193/')+'#/view/v1?c=-295.7,51,-2&t=-295.7,51,-6.1&p=-296,-8&f=40');
 await page.getByRole('button',{name:'3Dで景色を見る'}).click();
 await page.waitForFunction(()=>{const el=document.querySelector('select[aria-label="移動先"]');return el&&!el.disabled;});
 const canvas=page.locator('.search-world-canvas canvas');await canvas.waitFor();await page.waitForTimeout(5000);
 const box=await canvas.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(700);await page.mouse.up();
 const card=page.locator('.building-selection-card');await card.waitFor();
 // Public wording was changed to recruitment; the regression is the ownership, not the old wording.
 await card.getByText('この場所の情報を募集中',{exact:true}).waitFor();
 assert.equal(await card.locator('.place-introduction').count(),0,'neighbour must not show Byuuo introduction');
 await page.screenshot({path:'/tmp/byuuo-neighbour-merged.png'});
 console.log('PASS neighbour wall selects unregistered building; current recruitment wording shown');
}finally{await browser.close();}
