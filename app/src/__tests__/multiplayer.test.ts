import {describe,it,expect} from 'vitest';
import {validPose,WORLD_VERSION} from '../features/multiplayer/protocol';
const pose={id:'12345678-1234-1234-1234-123456789abc',name:'ダイバー',x:12,y:45,z:-100,yaw:1,speed:4,state:'air',active:true,world:WORLD_VERSION,seq:1};
describe('shared player input boundary',()=>{
 it('accepts the current world and all movement modes',()=>{for(const state of ['ground','air','water'])expect(validPose({...pose,state})).toBe(true);});
 it('rejects malformed, incompatible and nonfinite data',()=>{for(const change of [{x:NaN},{y:Infinity},{z:10001},{yaw:1000},{speed:-1},{seq:1.1},{state:'fall'},{world:'old'},{name:'a'.repeat(17)},{id:'fake'},{active:'yes'}])expect(validPose({...pose,...change})).toBe(false);expect(validPose(null)).toBe(false);});
});
