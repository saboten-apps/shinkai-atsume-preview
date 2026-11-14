import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import metadata from '../../public/environment/numazu-region.json';

describe('regional scenery asset',()=>{
 it('ships a complete compressed GLB within the scenery budget',()=>{
  const bytes=readFileSync(new URL('../../public/environment/numazu-region.glb',import.meta.url));
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  expect(bytes.length).toBe(metadata.bytes);expect(bytes.length).toBeLessThan(1000000);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.sha256);
 });
 it('includes the actual mountain ranges in the same frame without height exaggeration',()=>{
  expect(metadata.origin).toEqual({lat:35.0815,lon:138.8576,height:0});
  expect(metadata.verticalExaggeration).toBe(1);
  expect(metadata.maxElevation).toBeGreaterThan(3500);expect(metadata.maxElevation).toBeLessThan(3900);
  expect(metadata.checkpoints.find(p=>p.name.includes('愛鷹'))?.nearbyMax).toBeGreaterThan(1400);
  expect(metadata.checkpoints.find(p=>p.name.includes('鷲頭'))?.nearbyMax).toBeGreaterThan(250);
  expect(metadata.checkpoints.find(p=>p.name.includes('香貫'))?.nearbyMax).toBeGreaterThan(150);
 });
});
