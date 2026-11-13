// Download the port-bbox leaf b3dm tiles for lod1+lod2 via Range extraction.
import { extractEntry, entryInfo } from './extract-entry.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const found = JSON.parse(readFileSync(new URL('./port-tiles.json', import.meta.url), 'utf8'));
const OUT = '/tmp/plateau-scratch/tiles';
const summary = {};
for (const lod of ['lod1', 'lod2']) {
  const dir = `bldg_${lod}`;
  mkdirSync(`${OUT}/${lod}`, { recursive: true });
  let total = 0; const files = [];
  for (const t of found[lod].portTiles) {
    const name = `${dir}/${t.uri}`;
    const buf = await extractEntry(name);
    const base = t.uri.split('/').pop();
    writeFileSync(`${OUT}/${lod}/${base}`, buf);
    total += buf.length; files.push({ file: base, bytes: buf.length, zipEntry: name, compSize: entryInfo(name).compSize });
    console.log(`${lod} ${base}: ${buf.length} bytes`);
  }
  summary[lod] = { count: files.length, totalBytes: total, files };
  console.log(`== ${lod}: ${files.length} tiles, ${total} bytes total`);
}
writeFileSync(new URL('./downloaded-tiles.json', import.meta.url), JSON.stringify(summary, null, 1));
