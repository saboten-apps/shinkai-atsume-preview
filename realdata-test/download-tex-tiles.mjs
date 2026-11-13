// Download port-bbox b3dm tiles for bldg_lod2 (43) and bldg_lod3 (52) via
// Range extraction, for the texture-preserving conversion.
import { extractEntry, entryInfo } from './extract-entry.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const OUT = '/tmp/plateau-scratch/tiles';
const sets = [];
{
  const t = JSON.parse(readFileSync(new URL('./port-tiles.json', import.meta.url), 'utf8'));
  sets.push(['lod2tex', 'bldg_lod2', t.lod2.portTiles.map(x => x.uri)]);
}
{
  const t = JSON.parse(readFileSync(new URL('./lod3-tiles.json', import.meta.url), 'utf8'));
  sets.push(['lod3tex', 'bldg_lod3', t.portTiles.map(x => x.uri)]);
}
const summary = {};
for (const [key, dir, uris] of sets) {
  mkdirSync(`${OUT}/${key}`, { recursive: true });
  let total = 0; const files = [];
  for (const uri of uris) {
    const name = `${dir}/${uri}`;
    const buf = await extractEntry(name);
    const base = uri.split('/').pop();
    writeFileSync(`${OUT}/${key}/${base}`, buf);
    total += buf.length;
    files.push({ file: base, bytes: buf.length, zipEntry: name, compSize: entryInfo(name).compSize });
    console.log(`${key} ${base}: ${buf.length} bytes`);
  }
  summary[key] = { count: files.length, totalBytes: total, files };
  console.log(`== ${key}: ${files.length} tiles, ${total} bytes total`);
}
writeFileSync(new URL('./downloaded-tex-tiles.json', import.meta.url), JSON.stringify(summary, null, 1));
