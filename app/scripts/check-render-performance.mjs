import {createRequire} from 'node:module';import assert from 'node:assert/strict';import fs from 'node:fs';
const {chromium}=createRequire(import.meta.url)('playwright');
const proxy=process.env.BROWSER_PROXY?new URL(process.env.BROWSER_PROXY):null;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',proxy:proxy?{server:proxy.origin,username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password),bypass:'127.0.0.1,localhost'}:undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report=[];
const deviceDpr=Number(process.env.TEST_DPR||'.5');
try{
 for(const [label,url] of [['before',process.env.BASELINE_URL],['after',process.env.APP_URL||'http://127.0.0.1:5191/']]){
  if(!url)continue;
  const page=await browser.newPage({viewport:{width:412,height:820},deviceScaleFactor:deviceDpr});page.setDefaultTimeout(120000);
  await page.addInitScript(()=>{
    window.__renderMetrics={draws:0,hudReads:0};
    const original=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(...args){if(this.classList.contains('world-navigation'))window.__renderMetrics.hudReads++;return original.apply(this,args);};
    for(const constructor of [WebGLRenderingContext,WebGL2RenderingContext])for(const name of ['drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced']){
      const draw=constructor.prototype[name];if(!draw)continue;constructor.prototype[name]=function(...args){window.__renderMetrics.draws++;return draw.apply(this,args);};
    }
  });
  await page.goto(url+'#/view/port');await page.getByRole('button',{name:'3Dで景色を見る',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.search-flight-button')?.textContent==='飛んでみる');
  await page.waitForTimeout(12000);
  async function measure(scene){
   const start=await page.evaluate(()=>({t:performance.now(),...window.__renderMetrics}));await page.waitForTimeout(8000);
   const end=await page.evaluate(()=>({t:performance.now(),...window.__renderMetrics}));
   report.push({label,scene,elapsedMs:end.t-start.t,drawsPerSecond:(end.draws-start.draws)*1000/(end.t-start.t),hudReadsPerSecond:(end.hudReads-start.hudReads)*1000/(end.t-start.t),canvas:await page.locator('.search-world-canvas canvas').evaluate(el=>({width:el.width,height:el.height})),stats:await page.locator('.performance-panel').count()?await page.locator('.performance-panel').innerText():null});
   console.log(JSON.stringify(report.at(-1)));
  }
  await measure('port-idle');
  if(label==='after'){
   await page.locator('.performance-panel summary').click();await page.getByRole('button',{name:'30秒測定する',exact:true}).click();
   await page.waitForTimeout(31000);await page.getByText(/測定完了/).waitFor();
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'動作情報を保存',exact:true}).click();
   const file=await download;const data=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert(data.samples.length>=2);assert(data.samples.every(s=>s.renderTargetFps===30));
   assert(data.samples.every(s=>s.dpr<=Math.min(1.5,deviceDpr)&&s.dpr>=Math.min(.75,deviceDpr)));console.log('PASS 30-second performance recording and JSON export');
   await page.locator('.performance-panel summary').click();
   await page.getByRole('combobox',{name:'移動先'}).selectOption('station');await page.waitForTimeout(10000);await measure('station-idle');
   await page.getByRole('button',{name:'飛んでみる',exact:true}).click();await page.waitForTimeout(5000);await measure('station-flight');
   await page.locator('.performance-panel summary').click();assert((await page.locator('.performance-panel').innerText()).includes('描画上限 60 FPS'));
   await page.screenshot({path:'/tmp/render-performance.png'});
   await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
   const hiddenStart=await page.evaluate(()=>window.__renderMetrics.draws);await page.waitForTimeout(1500);
   assert.equal(await page.evaluate(()=>window.__renderMetrics.draws),hiddenStart,'hidden page still renders');
   await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
   await page.waitForTimeout(1500);assert((await page.evaluate(()=>window.__renderMetrics.draws))>hiddenStart,'rendering did not resume');
   console.log('PASS hidden-page rendering pause and resume');
  }
  await page.close();
 }
 fs.writeFileSync(process.env.REPORT_PATH||'/tmp/shinkai-render-performance.json',JSON.stringify(report,null,2));
}finally{await browser.close();}
