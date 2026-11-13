// Round-4: re-fetch the 43 port-bbox bldg_lod2 b3dm tiles via Range
// extraction into /tmp/plateau-scratch/tiles/lod2 (the scratch dir used by
// convert-bldg-color.mjs / convert-bldg-tex.mjs; /tmp had been wiped).
// Expected total: 9,868,112 B (matches convert-color-stats rawB3dmBytes).
import { extractEntry } from './extract-entry.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = '/tmp/plateau-scratch/tiles/lod2';
mkdirSync(OUT, { recursive: true });
const t = JSON.parse(readFileSync(new URL('./port-tiles.json', import.meta.url), 'utf8'));
let total = 0;
for (const x of t.lod2.portTiles) {
  const buf = await extractEntry(`bldg_lod2/${x.uri}`);
  const base = x.uri.split('/').pop();
  writeFileSync(`${OUT}/${base}`, buf);
  total += buf.length;
  console.log(`lod2 ${base}: ${buf.length}`);
}
console.log(`== lod2 refetch: ${t.lod2.portTiles.length} tiles, ${total} bytes (expected 9868112)`);
