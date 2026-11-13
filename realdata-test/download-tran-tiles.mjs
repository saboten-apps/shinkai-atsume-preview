// Download the port-bbox leaf b3dm tiles for tran_lod3 via Range extraction.
import { extractEntry, entryInfo } from './extract-entry.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const found = JSON.parse(readFileSync(new URL('./tran-tiles.json', import.meta.url), 'utf8'));
const OUT = '/tmp/plateau-scratch/tiles';
mkdirSync(`${OUT}/tran_lod3`, { recursive: true });
let total = 0; const files = [];
for (const t of found.tran_lod3.portTiles) {
  const name = `tran_lod3/${t.uri}`;
  const buf = await extractEntry(name);
  const base = t.uri.split('/').pop();
  writeFileSync(`${OUT}/tran_lod3/${base}`, buf);
  total += buf.length; files.push({ file: base, bytes: buf.length, zipEntry: name, compSize: entryInfo(name).compSize });
  console.log(`tran_lod3 ${base}: ${buf.length} bytes`);
}
console.log(`== tran_lod3: ${files.length} tiles, ${total} bytes total`);
writeFileSync(new URL('./downloaded-tran-tiles.json', import.meta.url),
  JSON.stringify({ tran_lod3: { count: files.length, totalBytes: total, files } }, null, 1));
