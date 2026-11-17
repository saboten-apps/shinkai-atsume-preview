import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:412,height:915}});const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5190/');
 await page.getByRole('button',{name:'釣り糸を垂らす',exact:true}).click();
 await page.getByRole('dialog',{name:'深海で魚を釣る'}).waitFor();
 await page.screenshot({path:'/tmp/deep-fishing.png'});
 await page.getByRole('button',{name:'引き上げる！',exact:true}).click();
 await page.getByRole('button',{name:'今日の魚を探しに行く'}).waitFor();
 const saved=await page.evaluate(()=>localStorage.getItem('shinkai_gacha_collection_v1'));assert(saved);
 await page.reload();await page.getByRole('button',{name:'今日の魚を探しに行く'}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('button',{name:'釣り演出をもう一度見る'}).click();await page.getByRole('button',{name:'演出をスキップ'}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('shinkai_gacha_collection_v1')),saved);
 assert(!requests.some(r=>/Map3DView|sharedExploration/.test(r)),'3D or networking fetched before exploration');assert.deepEqual(errors,[]);
 const second=await browser.newPage();await second.goto(process.env.APP_URL||'http://127.0.0.1:5190/');await second.getByRole('button',{name:'釣り糸を垂らす',exact:true}).click();await second.getByRole('button',{name:'演出をスキップ'}).click();await second.getByRole('button',{name:'今日の魚を探しに行く'}).waitFor();
 const reduced=await browser.newPage({reducedMotion:'reduce'});await reduced.goto(process.env.APP_URL||'http://127.0.0.1:5190/');await reduced.getByRole('button',{name:'釣り糸を垂らす',exact:true}).click();await reduced.getByRole('button',{name:'今日の魚を探しに行く'}).waitFor();assert.equal(await reduced.getByRole('dialog').count(),0);
 console.log('PASS fishing/reel, skip, reduced motion, saved result, lazy 3D/network');
}finally{await browser.close();}
