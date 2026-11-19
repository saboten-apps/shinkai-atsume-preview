import {describe,it,expect} from 'vitest';
import {describeArea,worldClockLabel} from '../features/exploration/map/worldStatus';
import {GAME_CLOCK} from '../features/exploration/map/atmosphere';
describe('readable area and game clock',()=>{
 it('names the current neighborhood and describes distance outside it',()=>{
  expect(describeArea(-130,-150)).toBe('沼津港周辺');expect(describeArea(210,-2395)).toBe('沼津駅南口周辺');expect(describeArea(-738.6,-1220.4)).toBe('千本浜公園周辺');expect(describeArea(548.5,-1567,true)).toContain('City Hall');expect(describeArea(20000,20000)).toBe('沼津市街');expect(describeArea(NaN,0)).toBe('沼津の街');
 });
 it('displays game time with zero padding and advances seasons on the shared clock',()=>{
  expect(worldClockLabel(new Date(GAME_CLOCK.epoch))).toMatchObject({season:'春',time:'00:00',period:'夜'});expect(worldClockLabel(new Date(GAME_CLOCK.epoch+150000))).toMatchObject({season:'春',time:'06:00'});expect(worldClockLabel(new Date(GAME_CLOCK.epoch+900000),true)).toMatchObject({season:'Summer',time:'12:00',period:'Day'});
 });
});
