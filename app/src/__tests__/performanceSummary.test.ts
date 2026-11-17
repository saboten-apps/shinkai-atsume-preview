import {describe,it,expect} from 'vitest';
import {summarize,captureTiming} from '../features/exploration/map/components/PerformancePanel';
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

it('identifies extended and sparse captures instead of presenting them as an ordinary 30-second run',()=>{
 const recorded=[sample({frames:133,elapsedMs:13859.2,fps:60}),sample({frames:1546,elapsedMs:116953.2,fps:40})];const timing=captureTiming(recorded,104000);expect(timing.issues).toContain('extended-duration');expect(timing.issues).toContain('few-samples');expect(timing.issues).toContain('long-sample-gap');expect(timing.worstIntervalFps).toBeCloseTo(13.7059,3);expect(timing.maxSampleGapMs).toBeCloseTo(103094);
});
it('recognizes well sampled captures and scene resets',()=>{
 const values=Array.from({length:30},(_,i)=>sample({frames:i*60,elapsedMs:i*1000}));expect(captureTiming(values,30010).issues).toEqual([]);expect(captureTiming([...values,sample({frames:0,elapsedMs:0})],30010).issues).toContain('scene-restarted');
});

it('does not report a negative average across a scene restart',()=>{
 const values=[sample({frames:900,elapsedMs:1000,fps:30}),sample({frames:10,elapsedMs:2000,fps:60})];expect(summarize(values).averageFps).toBe(45);expect(summarize(values).averageFpsSource).toBe('mean of per-second readings');
});
