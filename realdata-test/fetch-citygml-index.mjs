// Fetch the ZIP End-Of-Central-Directory + Central Directory of the PLATEAU
// CityGML (v2) ZIP for Numazu City 2021 using HTTP Range requests only.
// Output: citygml-zip-index.json: { zipUrl, totalSize, entries:[{name, method, compSize, uncompSize, offset}] }
// Handles ZIP64 EOCD and ZIP64 per-entry extras if present.
import { writeFileSync } from 'node:fs';

const ZIP_URL = 'https://assets.cms.plateau.reearth.io/assets/a5/88eb21-eb50-4b8f-9191-ba47313bdf7b/22203_numazu-shi_2021_citygml_4_op.zip';

async function rangeFetch(start, end) {
  const res = await fetch(ZIP_URL, {
    headers: { Range: `bytes=${start}-${end}`, 'User-Agent': 'Mozilla/5.0' },
  });
  if (res.status !== 206) throw new Error(`range ${start}-${end}: HTTP ${res.status}`);
  return { buf: Buffer.from(await res.arrayBuffer()), contentRange: res.headers.get('content-range') };
}

// 0. total size from a 1-byte range request
const probe = await rangeFetch(0, 0);
const m = /\/(\d+)$/.exec(probe.contentRange || '');
if (!m) throw new Error(`no total in Content-Range: ${probe.contentRange}`);
const TOTAL = Number(m[1]);
console.log(`total size: ${TOTAL} bytes (${(TOTAL / 1e9).toFixed(2)} GB)`);

// 1. EOCD in the last 64KB+22
const tailRes = await rangeFetch(TOTAL - 66000, TOTAL - 1);
const tail = tailRes.buf;
let eocd = -1;
for (let i = tail.length - 22; i >= 0; i--) {
  if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
}
if (eocd < 0) throw new Error('EOCD not found');
let cdCount = tail.readUInt16LE(eocd + 10);
let cdSize = tail.readUInt32LE(eocd + 12);
let cdOffset = tail.readUInt32LE(eocd + 16);
console.log(`EOCD: count=${cdCount} cdSize=${cdSize} cdOffset=${cdOffset}`);

// 2. ZIP64 EOCD if sentinels present
if (cdCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
  // locator: 20 bytes immediately before EOCD
  const locPos = eocd - 20;
  if (tail.readUInt32LE(locPos) !== 0x07064b50) throw new Error('ZIP64 locator not found');
  const z64off = Number(tail.readBigUInt64LE(locPos + 8));
  const zrec = (await rangeFetch(z64off, z64off + 55)).buf;
  if (zrec.readUInt32LE(0) !== 0x06064b50) throw new Error('ZIP64 EOCD record not found');
  cdCount = Number(zrec.readBigUInt64LE(32));
  cdSize = Number(zrec.readBigUInt64LE(40));
  cdOffset = Number(zrec.readBigUInt64LE(48));
  console.log(`ZIP64 EOCD: count=${cdCount} cdSize=${cdSize} cdOffset=${cdOffset}`);
}

// 3. Central directory (fetch in 8MB chunks)
const chunks = [];
for (let s = 0; s < cdSize; s += 8 * 1024 * 1024) {
  const e = Math.min(s + 8 * 1024 * 1024, cdSize) - 1;
  chunks.push((await rangeFetch(cdOffset + s, cdOffset + e)).buf);
}
const cd = Buffer.concat(chunks);
const entries = [];
let p = 0;
while (p < cd.length - 4 && cd.readUInt32LE(p) === 0x02014b50) {
  const method = cd.readUInt16LE(p + 10);
  let compSize = cd.readUInt32LE(p + 20);
  let uncompSize = cd.readUInt32LE(p + 24);
  const nameLen = cd.readUInt16LE(p + 28);
  const extraLen = cd.readUInt16LE(p + 30);
  const commentLen = cd.readUInt16LE(p + 32);
  let offset = cd.readUInt32LE(p + 42);
  const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
  if (compSize === 0xffffffff || uncompSize === 0xffffffff || offset === 0xffffffff) {
    // ZIP64 extra field 0x0001: order = uncomp, comp, offset (only for flagged fields)
    let q = p + 46 + nameLen;
    const qEnd = q + extraLen;
    while (q + 4 <= qEnd) {
      const tag = cd.readUInt16LE(q), sz = cd.readUInt16LE(q + 2);
      if (tag === 0x0001) {
        let r = q + 4;
        if (uncompSize === 0xffffffff) { uncompSize = Number(cd.readBigUInt64LE(r)); r += 8; }
        if (compSize === 0xffffffff) { compSize = Number(cd.readBigUInt64LE(r)); r += 8; }
        if (offset === 0xffffffff) { offset = Number(cd.readBigUInt64LE(r)); r += 8; }
        break;
      }
      q += 4 + sz;
    }
  }
  entries.push({ name, method, compSize, uncompSize, offset });
  p += 46 + nameLen + extraLen + commentLen;
}
console.log(`parsed ${entries.length} entries`);
writeFileSync(new URL('./citygml-zip-index.json', import.meta.url),
  JSON.stringify({ zipUrl: ZIP_URL, totalSize: TOTAL, entries }, null, 1));
const themes = {};
for (const e of entries) {
  const t = e.name.split('/').slice(0, 3).join('/');
  themes[t] = (themes[t] || 0) + 1;
}
console.log('path prefixes:', themes);
for (const e of entries.filter(e => /\/dem\//.test(e.name))) console.log('dem:', e.name, e.uncompSize);
