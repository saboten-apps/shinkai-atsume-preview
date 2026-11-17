import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const base=process.env.APP_URL||'http://127.0.0.1:5193/';
try {
 const context=await browser.newContext({viewport:{width:412,height:915},deviceScaleFactor:.5,reducedMotion:'reduce'});
 // No Supabase/Turnstile or other external service is contacted by this UI check.
 await context.route(/^https:\/\//,route=>route.abort());
 const page=await context.newPage();page.setDefaultTimeout(60000);
 const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(base);
 await page.evaluate(async()=>{const c=await caches.open('shinkai-map-stage-c-old');await c.put('./map/old-proof.json',new Response('{}'));});
 await page.getByRole('button',{name:'釣り糸を垂らす',exact:true}).click();
 await page.getByRole('button',{name:'軽い2D地図で探す',exact:true}).click();
 const collection=await page.evaluate(()=>localStorage.getItem('shinkai_gacha_collection_v1'));
 assert.ok(collection,'existing collection recorded');
 await page.getByRole('button',{name:'案内・設定',exact:true}).click();
 const warning=page.getByText('保存データが古くなっています。ダウンロードで現在の街データに更新できます。',{exact:true});
 await warning.waitFor();
 assert.ok(requests.some(u=>/download-manifest.json\?check=/.test(u)),'fresh manifest request');
 await page.getByRole('button',{name:'ダウンロード・再開',exact:true}).click();
 await page.getByText('街のデータを端末に保存しました。',{exact:true}).waitFor({timeout:120000});
 assert.equal(await warning.count(),0);
 const cachesReport=await page.evaluate(async()=>{
   const m=await(await fetch('./map/download-manifest.json')).json();const c=await caches.open('shinkai-map-'+m.version);
   return {keys:await caches.keys(),count:(await c.keys()).length,expected:m.assets.length+1};
 });
 assert.ok(!cachesReport.keys.includes('shinkai-map-stage-c-old'));
 assert.equal(cachesReport.count,cachesReport.expected);
 console.log('PASS old map warning, fresh manifest, verified download, old cache removed',JSON.stringify(cachesReport));
 const start=requests.length,token='ab'.repeat(32);
 await page.goto(base+'#/join/'+token);
 await page.getByText('共有探索への招待です。3Dを開いて参加を確認してください。',{exact:true}).waitFor();
 await page.getByRole('button',{name:'3Dで景色を見る',exact:true}).waitFor();
 assert.equal(await page.locator('canvas').count(),0,'join landing must remain light');
 assert.ok(!requests.slice(start).some(u=>/Map3DView-|sharedExploration-|\.glb(?:$|\?)/.test(u)),'no 3D loads before entry');
 await page.getByRole('button',{name:'3Dで景色を見る',exact:true}).click();
 await page.getByRole('button',{name:'招待された部屋に参加',exact:true}).click();
 await page.getByText('共有探索は準備中です。接続設定と招待試験の開始をお待ちください。',{exact:true}).waitFor();
 assert.ok(page.url().endsWith('#/join/'+token),'unjoined token is retained');
 // Changing invitations in the same tab must reset the previous room/scene.
 await page.goto(base+'#/join/invalid');
 await page.getByRole('button',{name:'3Dで景色を見る',exact:true}).click();
 await page.getByText('招待リンクを確認してください。',{exact:true}).waitFor();
 assert.ok(!requests.some(u=>/supabase|challenges.cloudflare.com|\/auth\/v1|\/rest\/v1/.test(u)));
 assert.equal(await page.evaluate(()=>localStorage.getItem('shinkai_gacha_collection_v1')),collection,'collection preserved');
 assert.deepEqual(errors,[]);
 console.log('PASS lazy invitation route, default feature OFF, invalid invite, collection preserved; no service requests or page errors');
} finally {await browser.close();}
