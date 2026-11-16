import {describe,it,expect} from 'vitest';
import {parseViewHash,viewHash,viewUrl,VIEWS} from '../features/scenery/viewpoint';
describe('public scenery links',()=>{
 it('round-trips supported camera views without a fish/date/collection',()=>{
  for(const p of Object.values(VIEWS))expect(parseViewHash(viewHash(p.view))?.view).toEqual(p.view);
  const url=viewUrl(VIEWS.byuuo.view,'https://example.test/preview/?release=v1#/explore/2026-11-16');
  expect(url).toMatch(/^https:\/\/example.test\/preview\/#\/view\/v1\?/);
  expect(url).not.toMatch(/fish|explore|release|2026/);
 });
 it('rejects unsupported, truncated, duplicate, infinite and out-of-area inputs',()=>{
  for(const s of ['#/view/__proto__','#/view/constructor','#/view/v2?c=1,2,3','#/view/v1?c=NaN,2,3&t=0,0,0&p=0,0&f=45','#/view/v1?c=1,2,3&t=1,2,3&p=0,0&f=45','#/view/v1?c=1,2,3&t=0,0,0&p=90000,0&f=45',viewHash(VIEWS.port.view)+'&f=60',viewHash(VIEWS.port.view)+'&fishId=f01','#/view/v1?'+'x'.repeat(400)])expect(parseViewHash(s)).toBeNull();
 });
 it('supports flight and underwater viewpoints with bounded numbers',()=>{
  const view={camera:[-250,35,50] as [number,number,number],target:[-260,30,20] as [number,number,number],focus:[-250,50] as [number,number],fov:58};
  expect(parseViewHash(viewHash(view))?.view).toEqual(view);
  expect(()=>viewHash({...view, fov:0})).toThrow();
 });
});
