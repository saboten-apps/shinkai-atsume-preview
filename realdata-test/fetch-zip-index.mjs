// Fetch the ZIP End-Of-Central-Directory + Central Directory of the PLATEAU
// 3D Tiles ZIP using HTTP Range requests only (never downloads the whole ZIP).
// Output: zip-index.json next to this script: [{name, method, compSize, uncompSize, offset}]
import { writeFileSync } from 'node:fs';

const ZIP_URL = 'https://assets.cms.plateau.reearth.io/assets/2d/00db5c-6e57-419e-8393-c35beb8123a8/22203_numazu-shi_2021_3dtiles-mvt_4_op.zip';
const TOTAL = 1471174728;

async function rangeFetch(start, end) {
  const res = await fetch(ZIP_URL, {
    headers: { Range: `bytes=${start}-${end}`, 'User-Agent': 'Mozilla/5.0' },
  });
  if (res.status !== 206) throw new Error(`range ${start}-${end}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// 1. EOCD: last 64KB+22 should contain it (zip comment up to 65535 bytes)
const tail = await rangeFetch(TOTAL - 66000, TOTAL - 1);
let eocd = -1;
for (let i = tail.length - 22; i >= 0; i--) {
  if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error('EOCD not found');
const cdCount = tail.readUInt16LE(eocd + 10);
const cdSize = tail.readUInt32LE(eocd + 12);
const cdOffset = tail.readUInt32LE(eocd + 16);
console.log(`entries=${cdCount} cdOffset=${cdOffset} cdSize=${cdSize}`);

// 2. Central directory (may be several MB; fetch in one range)
const cd = await rangeFetch(cdOffset, cdOffset + cdSize - 1);
const entries = [];
let p = 0;
while (p < cd.length - 4 && cd.readUInt32LE(p) === 0x02014b50) {
  const method = cd.readUInt16LE(p + 10);
  const compSize = cd.readUInt32LE(p + 20);
  const uncompSize = cd.readUInt32LE(p + 24);
  const nameLen = cd.readUInt16LE(p + 28);
  const extraLen = cd.readUInt16LE(p + 30);
  const commentLen = cd.readUInt16LE(p + 32);
  const offset = cd.readUInt32LE(p + 42);
  const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
  entries.push({ name, method, compSize, uncompSize, offset });
  p += 46 + nameLen + extraLen + commentLen;
}
console.log(`parsed ${entries.length} entries`);
writeFileSync(new URL('./zip-index.json', import.meta.url), JSON.stringify({ zipUrl: ZIP_URL, totalSize: TOTAL, entries }, null, 1));
const bldg = entries.filter(e => /bldg/.test(e.name));
console.log(`bldg entries: ${bldg.length}`);
for (const e of entries.filter(e => /tileset\.json$/.test(e.name))) console.log('tileset:', e.name, e.uncompSize);
