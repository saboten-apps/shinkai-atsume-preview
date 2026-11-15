import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import manifest from '../../public/environment/building-details/manifest.json';

describe('source photographic detail assets',()=>{
 it('restores only genuinely larger source images within the 2048px budget',()=>{
  expect(manifest.entries.length).toBeGreaterThan(0);expect(manifest.maxResidentTextures).toBe(3);
  expect(new Set(manifest.entries.map(e=>e.sourceName)).size).toBe(manifest.entries.length);
  for(const entry of manifest.entries){
   expect(Math.max(entry.width,entry.height)).toBeGreaterThan(Math.max(...entry.baseSize));
   expect(entry.width).toBeLessThanOrEqual(entry.sourceSize[0]);expect(entry.height).toBeLessThanOrEqual(entry.sourceSize[1]);
   expect(Math.max(entry.width,entry.height)).toBeLessThanOrEqual(2048);
  }
 });
 it('ships complete WebP assets matching the upgrade manifest',()=>{
  for(const entry of manifest.entries){
   const data=readFileSync(new URL(`../../public/${entry.url}`,import.meta.url));
   expect(data.toString('ascii',0,4)).toBe('RIFF');expect(data.toString('ascii',8,12)).toBe('WEBP');
   expect(data.length).toBe(entry.bytes);expect(createHash('sha256').update(data).digest('hex')).toBe(entry.sha256);
  }
 });
});
