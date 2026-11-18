import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();page.setDefaultTimeout(30000);const base=process.env.APP_URL||'http://127.0.0.1:5191/';
 await page.route('**/src/features/multiplayer/sharedExploration.ts?coop=*',async route=>{const response=await route.fetch();let body=await response.text();body=body.replaceAll('import.meta.env.VITE_SUPABASE_URL','"https://mock.invalid"').replaceAll('import.meta.env.VITE_SUPABASE_ANON_KEY','"mock-key"').replaceAll('import.meta.env.VITE_SHARED_EXPLORATION_ENABLED','"true"').replaceAll('createClient(', 'window.coopMockCreateClient(');await route.fulfill({response,body});});
 await page.goto(base);await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');const members=[],channels=[];let calls=0,sent=0;
  const ids=['12345678-1234-1234-1234-123456789abc','12345678-1234-1234-1234-123456789def'];
  const sync=()=>{for(const c of channels)c.presence?.();};
  window.coopMockCreateClient=()=>{const id=ids[calls++];return{
   auth:{getSession:async()=>({data:{session:{user:{id}}},error:null})},
   rpc:async(name,args)=>{if(name==='create_exploration_room'){members.push({user_id:id,session_id:args.p_session_id,display_name:args.p_display_name??id.slice(-3)});return{data:{room_id:'12345678-1234-1234-1234-123456789000',session_id:args.p_session_id,expires_at:new Date(Date.now()+3600000).toISOString(),invite_token:'ab'.repeat(32)},error:null};}if(name==='list_exploration_members')return{data:members,error:null};return{data:null,error:null};},
   channel:()=>{const c={id,state:'joined',tracked:null,socket:{isConnected:()=>c.state==='joined'},on(type,filter,callback){if(type==='broadcast')c.broadcast=callback;else c.presence=callback;return c;},subscribe(callback){queueMicrotask(()=>callback('SUBSCRIBED'));return c;},presenceState(){return Object.fromEntries(channels.filter(c=>c.tracked).map(c=>[c.id,[c.tracked]]));},async track(data){c.tracked=data;queueMicrotask(sync);return 'ok';},async untrack(){c.tracked=null;sync();},async send(m){sent++;for(const other of channels)if(other!==c)queueMicrotask(()=>other.broadcast?.({payload:structuredClone(m.payload)}));return 'ok';}};channels.push(c);return c;},
   removeChannel:async c=>{c.state='closed';c.tracked=null;sync();},
  };};
  const a=await import('/src/features/multiplayer/sharedExploration.ts?coop=a'),b=await import('/src/features/multiplayer/sharedExploration.ts?coop=b');const scenes=[new THREE.Scene(),new THREE.Scene()],handles=[];
  for(let i=0;i<2;i++){const div=document.createElement('div');div.id='coop-'+i;document.body.append(div);const setup=i?a.setupSharedExploration:b.setupSharedExploration;handles.push(setup(div,scenes[i],()=>({x:i*2,y:50,z:-100,vx:0,vy:0,vz:0,yaw:0,speed:0,state:'air',active:true,avatar:i?'angler':'mendako',hunt:'f02'})));div.querySelector('details').open=true;}
  window.coopCheck={scenes,handles,get sent(){return sent;}};
 });
 await page.locator('#coop-0 form button').click();await page.locator('#coop-1 form button').click();await page.waitForFunction(()=>[...document.querySelectorAll('[data-coop]')].every(el=>!el.hidden));
 await page.locator('#coop-0 [data-signal=fish]').click();await page.waitForFunction(()=>document.querySelector('#coop-1 [data-signal-notice]').textContent.includes('ここに魚'));
 const result=await page.evaluate(()=>({markers:window.coopCheck.scenes[1].children.filter(o=>o.type==='Sprite').length,peerAvatars:window.coopCheck.scenes[1].children.filter(o=>o.name==='HumanoidCharacter').length,sent:window.coopCheck.sent,notice:document.querySelector('#coop-1 [data-signal-notice]').textContent}));assert.equal(result.markers,1);assert.equal(result.peerAvatars,1);assert(result.sent<20);console.log(JSON.stringify({mockedTwoClients:true,...result}));await page.evaluate(()=>window.coopCheck.handles.forEach(h=>h.dispose()));
}finally{await browser.close();}
