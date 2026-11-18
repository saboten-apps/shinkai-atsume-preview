import {describe,it,expect,vi} from 'vitest';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {validPose,WORLD_VERSION,POSE_BOUNDS,predictPosition,type LocalPose} from '../features/multiplayer/protocol';
import {PosePublisher,type PoseChannel} from '../features/multiplayer/posePublisher';
import {invitationFromHash,invitationUrl,clearInvitation} from '../features/multiplayer/invitation';
import {ensureSharedSession,openRoom,connectionError} from '../features/multiplayer/roomApi';
const id='12345678-1234-1234-1234-123456789abc',session='12345678-1234-1234-1234-123456789def';
const local:LocalPose={x:12,y:45,z:-100,vx:4,vy:0,vz:0,yaw:1,speed:4,state:'air',active:true};
const pose={...local,id,session,world:WORLD_VERSION,seq:1};
function mockChannel(){
 const messages:unknown[]=[];let posts=0;
 const channel:PoseChannel={state:'joined',socket:{isConnected:()=>true},send:vi.fn(async m=>{
   if(channel.state!=='joined'||!channel.socket.isConnected())posts++;messages.push(m);return 'ok';
 })};return {channel,messages,posts:()=>posts};
}
async function run(publisher:PosePublisher,pose:LocalPose,others:number,start=0,end=30000){
 for(let now=start;now<end;now+=50){publisher.tick(now,pose,others);await Promise.resolve();await Promise.resolve();await Promise.resolve();}
}
describe('shared player boundary',()=>{
 it('accepts the expanded Senbon/Ganyudo flight area, not just the old search area',()=>{
  for(const state of ['ground','air','water'])expect(validPose({...pose,state})).toBe(true);
  expect(validPose({...pose,x:POSE_BOUNDS.minX,z:POSE_BOUNDS.maxZ})).toBe(true);
 });
 it('rejects nonfinite, out-of-city, incompatible and malformed payloads',()=>{
  for(const change of [{x:NaN},{y:Infinity},{x:POSE_BOUNDS.minX-51},{z:POSE_BOUNDS.maxZ+51},{yaw:100},{speed:-1},{speed:100},{vx:Infinity},{seq:1.1},{state:'fall'},{world:'old'},{id:'fake'},{session:''},{active:'yes'}])expect(validPose({...pose,...change})).toBe(false);
  expect(validPose(null)).toBe(false);
 });
 it('bounds 3-axis prediction to 350ms and playable world',()=>{
  expect(predictPosition({...local,vx:2,vy:3,vz:4},10000)).toEqual({x:12.7,y:46.05,z:-98.6});
  expect(predictPosition({...local,x:POSE_BOUNDS.maxX,vx:22},350).x).toBe(POSE_BOUNDS.maxX);
  expect(predictPosition(local,-10).x).toBe(local.x);
 });
});
describe('outgoing poses',()=>{
 it.each(['JOINING','CHANNEL_ERROR','TIMED_OUT','CLOSED'])('does not send for %s, with zero HTTP fallbacks',async status=>{
  const m=mockChannel(),p=new PosePublisher(m.channel,id,session);p.setStatus(status);await run(p,local,1);
  expect(m.messages).toHaveLength(0);expect(m.posts()).toBe(0);
 });
 it.each([[0,true,0],[0,false,0],[1,true,90],[1,false,10]])('30s: peers=%i moving=%s sends=%i',async(others,moving,count)=>{
  const m=mockChannel(),p=new PosePublisher(m.channel,id,session);p.setStatus('SUBSCRIBED');
  await run(p,moving?local:{...local,vx:0,speed:0},others);expect(m.messages).toHaveLength(count);expect(m.posts()).toBe(0);
 });
 it('checks actual socket/channel state even before status callback catches up',async()=>{
  const m=mockChannel(),p=new PosePublisher(m.channel,id,session);p.setStatus('SUBSCRIBED');
  m.channel.socket.isConnected=()=>false;await run(p,local,1);m.channel.socket.isConnected=()=>true;m.channel.state='joining';await run(p,local,1);
  expect(m.messages).toHaveLength(0);expect(m.posts()).toBe(0);
 });
 it('exercises the installed SDK REST fallback with a mocked fetch, and guards it',async()=>{
  const fetchMock=vi.fn<typeof globalThis.fetch>(async()=>new Response('{}',{status:200}));
  const client=createClient('https://unit-test.invalid','public-placeholder',{global:{fetch:fetchMock},realtime:{fetch:fetchMock},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const channel=client.channel('test',{config:{private:true}}),p=new PosePublisher(channel,id,session);
  await run(p,local,1);p.setStatus('SUBSCRIBED');await run(p,local,1);p.setStatus('CHANNEL_ERROR');await run(p,local,1);
  expect(fetchMock).not.toHaveBeenCalled();
  // Positive control: calling raw SDK send while unjoined would POST. No real network.
  const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{await channel.send({type:'broadcast',event:'pose',payload:pose});}finally{warning.mockRestore();}
  expect(fetchMock).toHaveBeenCalledTimes(1);expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({method:'POST'});
 });
 it('resumes with only the newest pose, never replays a disconnected backlog',async()=>{
  const m=mockChannel(),p=new PosePublisher(m.channel,id,session);p.setStatus('SUBSCRIBED');await run(p,local,1,0,1000);
  expect(m.messages).toHaveLength(3);p.setStatus('CHANNEL_ERROR');await run(p,{...local,x:100},1,1000,31000);
  expect(m.messages).toHaveLength(3);p.setStatus('SUBSCRIBED');p.tick(31000,{...local,x:200},1);
  expect(m.messages).toHaveLength(4);expect(m.messages[3]).toMatchObject({payload:{x:200,seq:4}});
 });
 it('does not repeatedly send inactive, hidden, or lone-player poses',async()=>{
  const m=mockChannel(),p=new PosePublisher(m.channel,id,session);p.setStatus('SUBSCRIBED');await run(p,{...local,active:false},1);expect(m.messages).toHaveLength(0);
  p.tick(30000,local,1,false);expect(m.messages).toHaveLength(0);
 });
 it('sends one inactive transition then stops, and sends stationary changes at the next slot',async()=>{
  const m=mockChannel(),p=new PosePublisher(m.channel,id,session);p.setStatus('SUBSCRIBED');const still={...local,vx:0,speed:0};
  await run(p,still,1,0,500);await run(p,{...still,yaw:2},1,500,1000);expect(m.messages).toHaveLength(2);
  await run(p,{...still,active:false},1,1000,30000);expect(m.messages).toHaveLength(3);
 });
 it('coalesces delayed sends and retries failures without concurrent queue growth',async()=>{
  const m=mockChannel();let complete:(result:string)=>void=()=>{};m.channel.send=vi.fn(()=>new Promise(resolve=>{complete=resolve;}));
  const p=new PosePublisher(m.channel,id,session);p.setStatus('SUBSCRIBED');await run(p,local,1);expect(m.channel.send).toHaveBeenCalledTimes(1);
  complete('timed out');await Promise.resolve();await Promise.resolve();await Promise.resolve();p.tick(30000,{...local,x:500},1);
  expect(m.channel.send).toHaveBeenCalledTimes(2);expect(m.channel.send).toHaveBeenLastCalledWith(expect.objectContaining({payload:expect.objectContaining({x:500})}));
 });
});
describe('invitations and session reuse',()=>{
 const token='ab'.repeat(32);
 it('accepts only full hash tokens, strips query on sharing and token on successful join',()=>{
  expect(invitationFromHash('#/join/'+token)).toBe(token);
  for(const invalid of ['?room='+id,'#/join/'+id,'#/join/'+token+'/extra','#/join/%61'])expect(invitationFromHash(invalid)).toBeNull();
  expect(invitationUrl('https://example.com/app/?room=old#/today',token)).toBe('https://example.com/app/#/join/'+token);
  const history={replaceState:vi.fn(),state:{test:1}};clearInvitation({href:'https://example.com/#/join/'+token},history);
  expect(history.replaceState).toHaveBeenCalledWith({test:1},'','https://example.com/#/view/port');
 });
 it('creates invitations only via RPC and uses the token for join',async()=>{
  const rpc=vi.fn(async()=>({data:{room_id:id,session_id:session,expires_at:'2026-11-17T12:00:00Z',invite_token:token},error:null}));const client={rpc} as unknown as SupabaseClient;
  await openRoom(client,'ダイバー',session,null);expect(rpc).toHaveBeenLastCalledWith('create_exploration_room',expect.not.objectContaining({p_token:expect.anything()}));
  await openRoom(client,'ダイバー',session,token);expect(rpc).toHaveBeenLastCalledWith('join_exploration_room',expect.objectContaining({p_token:token}));
  await expect(openRoom(client,'name',session,id)).rejects.toThrow('INVALID_INVITE');expect(rpc).toHaveBeenCalledTimes(2);
 });
 it('reuses an existing anonymous session and asks for CAPTCHA only when creating one',async()=>{
  const saved={user:{id}},captcha=vi.fn(async()=>'captcha-token');let existing:unknown=null;
  const signInAnonymously=vi.fn(async()=>{existing=saved;return{data:{session:saved},error:null};});
  const client={auth:{getSession:async()=>({data:{session:existing},error:null}),signInAnonymously}} as unknown as SupabaseClient;
  expect(await ensureSharedSession(client,captcha)).toBe(saved);expect(await ensureSharedSession(client,captcha)).toBe(saved);
  expect(signInAnonymously).toHaveBeenCalledTimes(1);expect(signInAnonymously).toHaveBeenCalledWith({options:{captchaToken:'captcha-token'}});expect(captcha).toHaveBeenCalledTimes(1);
 });
 it('distinguishes rate limiting and confirmed pause from unknown connection failure',()=>{
  expect(connectionError(new Error('HOST_REQUIRED'))).toContain('主催者のみ');
  expect(connectionError({status:429})).toContain('接続回数の上限');expect(connectionError({status:503})).toContain('休止中');expect(connectionError(new Error('network'))).toContain('可能性');
 });
});

it('accepts known appearance and vehicle data, and rejects arbitrary or incompatible remote models',()=>{
 expect(validPose({...pose,avatar:'jellyfish',pose:'wave',vehicle:'none'})).toBe(true);
 expect(validPose({...pose,state:'water',avatar:'angler',pose:'salute',vehicle:'submarine'})).toBe(true);
 for(const fields of [{avatar:'custom-url'},{pose:'invalid'},{vehicle:'car'},{vehicle:'submarine',state:'air'}])expect(validPose({...pose,...fields})).toBe(false);
});
it('publishes stationary appearance, photo pose and vehicle changes without increasing the send rate',async()=>{
 const m=mockChannel(),p=new PosePublisher(m.channel,id,session);p.setStatus('SUBSCRIBED');const still={...local,vx:0,speed:0};
 await run(p,still,1,0,500);await run(p,{...still,avatar:'angler',pose:'wave'},1,500,1000);await run(p,{...still,state:'water',vehicle:'submarine'},1,1000,1500);
 expect(m.messages).toHaveLength(3);expect(m.messages[1]).toMatchObject({payload:{avatar:'angler',pose:'wave'}});expect(m.messages[2]).toMatchObject({payload:{vehicle:'submarine'}});expect(m.posts()).toBe(0);
});
