// Download the port-bbox leaf b3dm tiles for veg via Range extraction.
import { extractEntry, entryInfo } from './extract-entry.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const found = JSON.parse(readFileSync(new URL('./veg-tiles.json', import.meta.url), 'utf8'));
const OUT = '/tmp/plateau-scratch/tiles';
mkdirSync(`${OUT}/veg`, { recursive: true });
let total = 0; const files = [];
for (const t of found.veg.portTiles) {
  const name = `veg/${t.uri}`;
  const buf = await extractEntry(name);
  const base = t.uri.split('/').pop();
  writeFileSync(`${OUT}/veg/${base}`, buf);
  total += buf.length; files.push({ file: base, bytes: buf.length, zipEntry: name, compSize: entryInfo(name).compSize });
  console.log(`veg ${base}: ${buf.length} bytes`);
}
console.log(`== veg: ${files.length} tiles, ${total} bytes total`);
writeFileSync(new URL('./downloaded-veg-tiles.json', import.meta.url),
  JSON.stringify({ veg: { count: files.length, totalBytes: total, files } }, null, 1));
