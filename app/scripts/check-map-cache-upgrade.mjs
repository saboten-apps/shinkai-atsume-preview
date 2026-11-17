import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const base=process.env.APP_URL||'http://127.0.0.1:5191/';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext(),page=await context.newPage();await page.goto(base);
 const seeded=await page.evaluate(async()=>{
  const base=new URL('./',location.href).href;await navigator.serviceWorker.register(base+'map-cache-sw.js');await navigator.serviceWorker.ready;for(let i=0;i<100&&!navigator.serviceWorker.controller;i++)await new Promise(r=>setTimeout(r,50));if(!navigator.serviceWorker.controller)throw Error('No service worker');
  const manifest=await(await fetch(base+'map/download-manifest.json?upgrade-test=1')).json(),asset=manifest.assets.find(a=>a.url.endsWith('/night-lights.json'));
  const fresh=new URL(asset.url,base);fresh.searchParams.set('map-download',asset.sha256);const bytes=await(await fetch(fresh)).arrayBuffer();const old=await caches.open('shinkai-map-'+'0'.repeat(16));await old.put(base+'map/download-manifest.json',new Response(JSON.stringify({...manifest,assets:[asset],totalBytes:asset.bytes})));await old.put(base+asset.url,new Response('corrupt'));
  window.cacheHelper=await import('/src/features/exploration/mapDownloadCache.ts');window.cacheUpgrade={base,manifest,asset,bytes};return {bytes:bytes.byteLength,version:manifest.version};
 });
 await context.setOffline(true);
 const rejected=await page.evaluate(async()=>{try{await fetch(new URL(window.cacheUpgrade.asset.url,window.cacheUpgrade.base));return false;}catch{return true;}});assert(rejected,'Corrupt legacy bytes were served');
 const result=await page.evaluate(async()=>{
  const {base,manifest,asset,bytes}=window.cacheUpgrade,old=await caches.open('shinkai-map-'+'0'.repeat(16));await old.put(base+asset.url,new Response(bytes,{headers:{'content-type':'application/json'}}));
  const actual=await(await fetch(base+asset.url)).arrayBuffer();const offlineManifest=await(await fetch(base+'map/download-manifest.json?offline=1')).json();const {mapCacheName}=window.cacheHelper;const current=await caches.open(mapCacheName(manifest.version,base));
  return {bytes:actual.byteLength,copied:!!await current.match(base+asset.url),offlineVersion:offlineManifest.version};
 });
 assert.equal(result.bytes,seeded.bytes);assert(result.copied);assert.equal(result.offlineVersion,seeded.version);await context.setOffline(false);console.log(JSON.stringify({result:'pass',...result}));
}finally{await browser.close();}
