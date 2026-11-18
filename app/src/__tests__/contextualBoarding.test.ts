import {describe,it,expect} from 'vitest';
import {FreeFlightController,SEA} from '../features/exploration/map/flight/freeFlight';
describe('boarding at the current location',()=>{
 it('offers water vehicles only near water and never changes horizontal coordinates',()=>{
  const p=new FreeFlightController();p.activate(true);p.setWaterQuery((x,z)=>Math.abs(x)<10&&Math.abs(z)<10);p.teleport(2,SEA+.5,3);
  expect(p.availableVehicles()).toEqual(['boat','submarine']);expect(p.setVehicle('boat')).toBe(true);expect(p.position.x).toBe(2);expect(p.position.z).toBe(3);expect(p.position.y).toBeCloseTo(SEA+.04);
  expect(p.setVehicle('submarine')).toBe(true);expect(p.position.x).toBe(2);expect(p.position.z).toBe(3);expect(p.position.y).toBeCloseTo(SEA-.5);expect(p.state).toBe('water');
  p.teleport(2,SEA-5,3);expect(p.availableVehicles()).toEqual(['submarine']);expect(p.setVehicle('boat')).toBe(false);expect(p.position.y).toBeCloseTo(SEA-5);
 });
 it('does not summon a vehicle on dry ground, in the sky or before entry',()=>{
  const p=new FreeFlightController();p.setWaterQuery(()=>true);p.teleport(0,SEA,0);expect(p.availableVehicles()).toEqual([]);p.activate(true);p.teleport(0,SEA+20,0);expect(p.availableVehicles()).toEqual([]);const old=p.position.clone();expect(p.setVehicle('submarine')).toBe(false);expect(p.position.equals(old)).toBe(true);
  p.setWaterQuery(()=>false);p.teleport(0,SEA+.2,0);expect(p.availableVehicles()).toEqual([]);expect(p.setVehicle('boat')).toBe(false);expect(p.setVehicle('submarine')).toBe(false);
 });
});
