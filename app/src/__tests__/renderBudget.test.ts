import {describe,it,expect} from 'vitest';
import {RenderBudget} from '../features/exploration/map/renderBudget';
describe('render budget',()=>{
 it('caps high-refresh screens at 60 and idle rendering at 30',()=>{
   for(const hz of [60,90,120,144])for(const target of [30,60] as const){const budget=new RenderBudget(3);budget.reset(0);let frames=0;
     for(let tick=0;tick<hz*10;tick++)if(budget.shouldRender(tick*1000/hz,target))frames++;
     expect(frames).toBeGreaterThanOrEqual(target*10-2);expect(frames).toBeLessThanOrEqual(target*10+2);
   }
 });
 it('lowers sustained slow resolution, respects bounds and retries the failed level only after a wait',()=>{
   const budget=new RenderBudget(3);budget.reset(0);
   for(let now=50;now<=12000;now+=50)budget.sample(now,true);
   expect(budget.dpr).toBe(.75);expect(budget.changes).toBe(3);
   budget.reset(12000);
   // Fast frames straight after the drop do not raise it: the level above has just failed.
   for(let tick=1;tick<=720;tick++)budget.sample(12000+tick*1000/60,true);
   expect(budget.dpr).toBe(.75);
   // Once the wait has passed, ten fast seconds raise it one step at a time.
   for(let tick=721;tick<=3600;tick++)budget.sample(12000+tick*1000/60,true);
   expect(budget.dpr).toBeGreaterThan(.75);expect(budget.dpr).toBeLessThanOrEqual(1.5);
 });
 it('recovers on a map that alternates short drags with stillness',()=>{
   const budget=new RenderBudget(3);budget.reset(0);
   let now=0;const frame=(target:30|60,fps:number)=>{now+=1000/fps;budget.shouldRender(now,target);budget.sample(now,true);};
   while(now<3000)frame(60,20);
   expect(budget.dpr).toBeLessThan(1.5);
   // Drag for three seconds, rest for five, as on a map. No ten-second stretch of movement occurs.
   while(now<120000)(now%8000)<3000?frame(60,60):frame(30,30);
   expect(budget.dpr).toBe(1.5);
 });
 it('spaces out retries of a level the device cannot hold',()=>{
   const budget=new RenderBudget(3);budget.reset(0);
   let now=0;const raises:number[]=[];
   // 40 FPS at full resolution, 60 FPS one step lower.
   while(now<600000){const before=budget.dpr;now+=1000/(budget.dpr>=1.5?40:60);budget.shouldRender(now,60);budget.sample(now,true);if(budget.dpr>before)raises.push(now);}
   expect(budget.dpr).toBeLessThan(1.5);
   expect(raises.length).toBeGreaterThanOrEqual(2);expect(raises.length).toBeLessThanOrEqual(6);
   const gaps=raises.slice(1).map((time,index)=>time-raises[index]);
   for(let index=1;index<gaps.length;index++)expect(gaps[index]).toBeGreaterThanOrEqual(gaps[index-1]-1000);
   expect(gaps.at(-1)!).toBeGreaterThan(gaps[0]);
 });
 it('ignores loading and resets hidden-tab gaps without lowering low-DPR devices',()=>{
   const budget=new RenderBudget(.6);budget.reset(0);
   budget.sample(30000,false);expect(budget.dpr).toBe(.6);
   budget.reset(60000);expect(budget.shouldRender(60000,60)).toBe(true);
   for(let now=60100;now<=66000;now+=100)budget.sample(now,true);
   expect(budget.dpr).toBe(.6);
 });
});
