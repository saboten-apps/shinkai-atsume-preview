// Probe the head of dem GML entries in the CityGML ZIP: stream-inflate only the
// first compressed bytes and print the gml:boundedBy envelope + first geometry tags.
// Usage: node probe-dem-head.mjs <entryName> [<entryName>...]
import { readFileSync } from 'node:fs';
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';

const index = JSON.parse(readFileSync(new URL('./citygml-zip-index.json', import.meta.url), 'utf8'));
const byName = new Map(index.entries.map(e => [e.name, e]));
const PREFIX = '22203_numazu-shi_2021_citygml_4_op/udx/dem/';

async function rangeBuf(start, end) {
  const res = await fetch(index.zipUrl, {
    headers: { Range: `bytes=${start}-${end}`, 'User-Agent': 'Mozilla/5.0' },
  });
  if (res.status !== 206) throw new Error(`range ${start}-${end}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function headText(entry, compBytes = 400000, wantText = 120000) {
  const lh = await rangeBuf(entry.offset, entry.offset + 29);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header');
  const dataStart = entry.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  const raw = await rangeBuf(dataStart, dataStart + Math.min(compBytes, entry.compSize) - 1);
  return await new Promise((resolve) => {
    const inf = createInflateRaw();
    let out = '';
    inf.on('data', (c) => {
      out += c.toString('utf8');
      if (out.length >= wantText) { inf.destroy(); resolve(out); }
    });
    inf.on('error', () => resolve(out));
    inf.on('end', () => resolve(out));
    inf.end(raw);
  });
}

for (const arg of process.argv.slice(2)) {
  const name = PREFIX + arg;
  const e = byName.get(name);
  if (!e) { console.log(`${arg}: NOT FOUND`); continue; }
  const t = await headText(e);
  const env = /<gml:boundedBy>[\s\S]{0,600}/.exec(t)?.[0] || '';
  const lower = /<gml:lowerCorner>([^<]+)<\/gml:lowerCorner>/.exec(env)?.[1];
  const upper = /<gml:upperCorner>([^<]+)<\/gml:upperCorner>/.exec(env)?.[1];
  const firstTri = t.indexOf('TriangulatedSurface');
  const firstPosList = t.indexOf('<gml:posList');
  const snippet = firstPosList >= 0 ? t.slice(Math.max(0, firstPosList - 200), firstPosList + 200).replace(/\s+/g, ' ') : '';
  console.log(`== ${arg} (uncomp ${e.uncompSize})`);
  console.log(`   envelope lower=[${lower}] upper=[${upper}]`);
  console.log(`   TriangulatedSurface at ${firstTri}, first posList at ${firstPosList}`);
  if (snippet) console.log(`   ...${snippet}...`);
}
