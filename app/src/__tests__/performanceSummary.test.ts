import {describe,it,expect} from 'vitest';
import {summarize} from '../features/exploration/map/components/PerformancePanel';
import type {PerformanceStats} from '../features/exploration/map/types';
const sample=(over:Partial<PerformanceStats>):PerformanceStats=>({fps:60,drawCalls:1,triangles:1,dpr:1.5,geometries:1,textures:1,...over});
describe('performance capture summary',()=>{
 it('derives the average from the frame counter, not from per-second readings',()=>{
   // 1,200 frames in 30 s is 40 FPS, although every half-second reading happened to show 60.
   const samples=[sample({frames:100,elapsedMs:10000}),sample({frames:700,elapsedMs:25000}),sample({frames:1300,elapsedMs:40000})];
   const summary=summarize(samples);
   expect(summary.averageFps).toBeCloseTo(40);expect(summary.averageFpsSource).toBe('frame counter');
 });
 it('reports the worst frame costs, the resolution range and its changes during the capture',()=>{
   const summary=summarize([
     sample({frames:0,elapsedMs:0,dpr:1.5,dprChanges:2,renderMsAvg:4,renderMsMax:9,updateMsAvg:1,rafP95Ms:9,jsHeapMB:40,fps:58}),
     sample({frames:50,elapsedMs:1000,dpr:1.25,dprChanges:3,renderMsAvg:12,renderMsMax:41,updateMsAvg:3,rafP95Ms:34,jsHeapMB:44,fps:41}),
   ]);
   expect(summary).toMatchObject({minFps:41,renderMsAvgMax:12,renderMsMax:41,updateMsAvgMax:3,rafP95MsMax:34,dprMin:1.25,dprMax:1.5,dprChanges:1,jsHeapMBMax:44});
 });
 it('falls back to the readings for a single sample or an older capture',()=>{
   expect(summarize([sample({fps:30})])).toMatchObject({averageFps:30,averageFpsSource:'mean of per-second readings'});
 });
});
