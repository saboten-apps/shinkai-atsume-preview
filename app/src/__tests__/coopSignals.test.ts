import {describe,it,expect} from 'vitest';
import {SignalComposer,SignalInbox,validSignal} from '../features/multiplayer/coopSignals';
import {PosePublisher,type PoseChannel} from '../features/multiplayer/posePublisher';
import {validPose,type LocalPose} from '../features/multiplayer/protocol';
describe('cooperative signal boundaries',()=>{
 it('limits send frequency, expires signals and rejects arbitrary data',()=>{const c=new SignalComposer();expect(c.send('fish',0,'f02')).toBe(true);expect(c.send('photo',4999)).toBe(false);expect(c.get(11999)).toEqual({id:1,kind:'fish',fishId:'f02'});expect(c.get(12000)).toBeUndefined();expect(c.send('photo',12000)).toBe(true);for(const s of [null,{id:1,kind:'chat',text:'arbitrary'},{id:NaN,kind:'fish'},{id:2,kind:'fish',fishId:'f99'}])expect(validSignal(s)).toBe(false);});
 it('does not extend duplicate markers, limits a peer, and accepts a new authorized session',()=>{const inbox=new SignalInbox();expect(inbox.accept('a','session1',{id:1,kind:'fish'},0)).toBe(true);expect(inbox.accept('a','session1',{id:1,kind:'fish'},6000)).toBe(false);expect(inbox.accept('a','session1',{id:2,kind:'photo'},1000)).toBe(false);expect(inbox.accept('a','session2',{id:1,kind:'follow'},2000)).toBe(true);inbox.clear();expect(inbox.accept('a','session2',{id:1,kind:'follow'},3000)).toBe(true);});
 it('delivers a bounded signal between two mocked endpoints only after joining, with no REST fallbacks',async()=>{
  const composer=new SignalComposer(),inbox=new SignalInbox(),received:unknown[]=[];let posts=0;
  const channel:PoseChannel={state:'joined',socket:{isConnected:()=>true},send:async m=>{if(channel.state!=='joined')posts++;if(validPose(m.payload)&&m.payload.signal&&inbox.accept(m.payload.id,m.payload.session,m.payload.signal,0))received.push(m.payload.signal);return 'ok';}};
  const p=new PosePublisher(channel,'12345678-1234-1234-1234-123456789abc','12345678-1234-1234-1234-123456789def');
  const pose:LocalPose={x:0,y:50,z:0,vx:0,vy:0,vz:0,speed:0,yaw:0,active:true,state:'air',hunt:'f02'};composer.send('fish',0,'f02');p.tick(0,{...pose,signal:composer.get(0)},1);expect(received).toHaveLength(0);p.setStatus('SUBSCRIBED');p.tick(50,{...pose,signal:composer.get(50)},1);await Promise.resolve();expect(received).toEqual([{id:1,kind:'fish',fishId:'f02'}]);expect(posts).toBe(0);p.setStatus('CHANNEL_ERROR');p.tick(6000,{...pose,signal:composer.get(6000)},1);expect(received).toHaveLength(1);
 });
});
