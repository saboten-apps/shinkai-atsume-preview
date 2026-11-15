import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const action of ['2d','back']){
  const context=await browser.newContext({viewport:{width:412,height:915},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/map/components/Map3DView.tsx*',async route=>{await gate;await route.continue().catch(()=>{});});
  await page.goto(process.env.APP_URL||'http://127.0.0.1:5180/');
  await page.getByRole('button',{name:'本日の標本を引き上げる（1日1回）',exact:true}).click();
  const name=await page.locator('.gacha-explore-launch h2').innerText();
  if(action==='2d')await page.screenshot({path:'/tmp/shinkai-seamless-result.png',fullPage:false});
  const stored=await page.evaluate(()=>localStorage.getItem('shinkai_gacha_collection_v1'));
  assert(!requests.some(u=>/Map3DView|\.glb/.test(u)),'3D downloaded before entry');
  await page.getByRole('button',{name:'今日の魚を探しに行く',exact:true}).click();
  await page.locator('.exploration-page .exploration-loading').waitFor();
  assert.equal(await page.locator('#exploration-loading-title').innerText(),name);
  if(action==='2d')await page.screenshot({path:'/tmp/shinkai-seamless-loading.png'});
  assert(await page.locator('.app-header').evaluate(el=>el.inert),'loading leaves header interactive');
  if(action==='2d'){
   await page.getByRole('button',{name:'待たずに2Dで探す',exact:true}).click();
   await page.locator('.search-2d svg').waitFor();
  }else{
   await page.getByRole('button',{name:'結果に戻る',exact:true}).click();
   await page.locator('.gacha-explore-launch').waitFor();
  }
  release();
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.exploration-loading').count(),0);
  assert.equal(await page.locator('.search-map canvas').count(),0);
  assert(!await page.locator('.app-header').evaluate(el=>el.inert),'header remained inert');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shinkai_gacha_collection_v1')),stored);
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log(JSON.stringify({result:'pass',checks:['no 3D before entry','same fish through loading','loading can continue in 2D','loading can return to result','late module load does not reopen city','header and collection restored']}));
}finally{await browser.close();}
