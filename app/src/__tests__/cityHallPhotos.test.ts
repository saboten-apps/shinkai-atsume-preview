import {describe,it,expect} from 'vitest';
import {photoProjection,type PhotoQuad} from '../features/exploration/map/three/cityHallPhotos';

describe('photographic facade projection',()=>{
 it('maps all four source corners without the diagonal seam of a two-triangle crop',()=>{
  const q:PhotoQuad=[[.2,.1],[.7,.2],[.8,.9],[.1,.7]],project=photoProjection(q);
  for(const [i,[u,v]] of [[0,[0,0]],[1,[1,0]],[2,[1,1]],[3,[0,1]]] as const){
   const p=project(u,v);expect(p[0]).toBeCloseTo(q[i][0],8);expect(p[1]).toBeCloseTo(q[i][1],8);
  }
  const start=project(.5,0),end=project(.5,1),mid=project(.5,.5);
  expect((end[0]-start[0])*(mid[1]-start[1])-(end[1]-start[1])*(mid[0]-start[0])).toBeCloseTo(0,8);
  for(let u=0;u<=1;u+=.1)for(let v=0;v<=1;v+=.1){const p=project(u,v);expect(p.every(Number.isFinite)).toBe(true);expect(p[0]).toBeGreaterThanOrEqual(.099);expect(p[0]).toBeLessThanOrEqual(.801);}
 });
 it('rejects a collapsed source area',()=>{expect(()=>photoProjection([[0,0],[1,0],[1,0],[0,0]])).toThrow('Degenerate');});
});
