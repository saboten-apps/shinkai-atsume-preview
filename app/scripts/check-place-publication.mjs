import fs from 'node:fs';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const target='src/features/scenery/publishedPlaces.json',original=fs.readFileSync(target);
const record=JSON.parse(fs.readFileSync('public/map/data/buildings-station-5-2.json')).buildings.find(b=>!b.isCityHall);
const draft={id:'draft-validation',buildingId:record.id,x:record.center[0],z:record.center[2],name:'取り込み検証用',description:'紹介文の表示確認',url:'https://example.com',photo:'environment/city-hall/preview.webp',photographer:'Private provider',permission:'Private permission correspondence',credit:'写真：検証用'};
let browser;
try{
 fs.writeFileSync('/tmp/place-publication-check.json',JSON.stringify({version:1,drafts:[draft]}));
 execFileSync('node',['scripts/import-place-drafts.mjs','/tmp/place-publication-check.json','--apply'],{stdio:'inherit'});
 const published=fs.readFileSync(target,'utf8');assert(!published.includes('Private'));assert(JSON.parse(published).some(p=>p.id===draft.id));
 execFileSync('npm',['run','build'],{stdio:'pipe'});
 const {chromium}=createRequire(import.meta.url)('playwright');browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const page=await browser.newPage();
 await page.goto((process.env.APP_URL||'http://127.0.0.1:5195/')+'#/view/draft-validation');
 await page.locator('.place-introduction h3').filter({hasText:draft.name}).waitFor();
 assert(await page.getByRole('link',{name:'関連サイト',exact:false}).isVisible());
 assert((await page.locator('.place-introduction').innerText()).includes(draft.credit));
 await page.goto((process.env.APP_URL||'http://127.0.0.1:5195/')+'#/places');assert.equal(await page.locator('.place-tile').count(),3);
 console.log('PASS CLI import -> build -> introduction and gallery; permission records excluded from public data');
}finally{if(browser)await browser.close();fs.writeFileSync(target,original);}
