import {describe,it,expect} from 'vitest';
import {RenderBudget} from '../features/exploration/map/renderBudget';
describe('render budget',()=>{
 it('caps high-refresh screens at 60 and idle rendering at 30',()=>{
   for(const hz of [60,90,120,144])for(const target of [30,60] as const){const budget=new RenderBudget(3);budget.reset(0);let frames=0;
     for(let tick=0;tick<hz*10;tick++)if(budget.shouldRender(tick*1000/hz,target))frames++;
     expect(frames).toBeGreaterThanOrEqual(target*10-2);expect(frames).toBeLessThanOrEqual(target*10+2);
   }
 });
 it('lowers sustained slow resolution, respects bounds and recovers slowly',()=>{
   const budget=new RenderBudget(3);budget.reset(0);
   for(let now=50;now<=12000;now+=50)budget.sample(now,true);
   expect(budget.dpr).toBe(.75);
   budget.reset(12000);
   for(let tick=1;tick<=120;tick++)budget.sample(12000+tick*1000/60,true);
   expect(budget.dpr).toBe(.75);
   for(let tick=121;tick<=720;tick++)budget.sample(12000+tick*1000/60,true);
   expect(budget.dpr).toBeGreaterThan(.75);expect(budget.dpr).toBeLessThanOrEqual(1.5);
 });
 it('ignores loading and resets hidden-tab gaps without lowering low-DPR devices',()=>{
   const budget=new RenderBudget(.6);budget.reset(0);
   budget.sample(30000,false);expect(budget.dpr).toBe(.6);
   budget.reset(60000);expect(budget.shouldRender(60000,60)).toBe(true);
   for(let now=60100;now<=66000;now+=100)budget.sample(now,true);
   expect(budget.dpr).toBe(.6);
 });
});
