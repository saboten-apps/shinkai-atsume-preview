import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:360,height:800}});const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto((process.env.APP_URL||'http://127.0.0.1:5191/')+'#/today');
 await page.getByRole('button',{name:'まちを見る',exact:true}).click();
 await page.getByRole('heading',{name:'沼津のまちを見る',exact:true}).waitFor();
 assert.equal(await page.locator('.place-tile').count(),2);
 await page.locator('.place-tile img').first().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>[...document.querySelectorAll('.place-tile img')].every(i=>i.complete&&i.naturalWidth>0));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
 assert(!requests.some(u=>/Map3DView|three|\.glb|buildings-.*json/.test(u)),'3D loaded in gallery');
 await page.screenshot({path:'/tmp/places-gallery.png',fullPage:true});
 await page.locator('.place-tile').first().click();
 await page.locator('.place-introduction h3').filter({hasText:'沼津市役所'}).waitFor();
 assert(await page.getByRole('button',{name:'3Dで景色を見る',exact:true}).isVisible());
 assert(!requests.some(u=>/Map3DView|\.glb/.test(u)),'3D loaded before opening');
 await page.getByRole('button',{name:'この場所を共有',exact:true}).click();
 await page.locator('.place-introduction [role=status]').waitFor();
 await page.getByRole('link',{name:'場所の一覧へ',exact:false}).click();
 await page.getByRole('button',{name:'Toggle Language (Japanese / English)'}).click();
 await page.getByRole('heading',{name:'Explore Numazu',exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'English mobile overflow');
 console.log('PASS mobile gallery, photos, routes, bilingual navigation, share fallback, and no 3D download before opening');
}finally{await browser.close();}
