// Extract single entries from the PLATEAU CityGML ZIP using Range requests.
// Same mechanics as extract-entry.mjs (which targets the 3D Tiles ZIP), but
// reads citygml-zip-index.json. Exports extractCityGmlEntry(name) -> Buffer.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { dirname } from 'node:path';

const index = JSON.parse(readFileSync(new URL('./citygml-zip-index.json', import.meta.url), 'utf8'));
const ZIP_URL = index.zipUrl;
const byName = new Map(index.entries.map(e => [e.name, e]));

async function rangeFetch(start, end) {
  const res = await fetch(ZIP_URL, {
    headers: { Range: `bytes=${start}-${end}`, 'User-Agent': 'Mozilla/5.0' },
  });
  if (res.status !== 206) throw new Error(`range ${start}-${end}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function extractCityGmlEntry(name) {
  const e = byName.get(name);
  if (!e) throw new Error(`entry not found: ${name}`);
  const lh = await rangeFetch(e.offset, e.offset + 29);
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
  const nameLen = lh.readUInt16LE(26);
  const extraLen = lh.readUInt16LE(28);
  const dataStart = e.offset + 30 + nameLen + extraLen;
  const raw = await rangeFetch(dataStart, dataStart + e.compSize - 1);
  if (raw.length !== e.compSize) throw new Error(`short read ${name}: ${raw.length} != ${e.compSize}`);
  if (e.method === 0) return raw;
  if (e.method === 8) return inflateRawSync(raw);
  throw new Error(`unsupported method ${e.method} for ${name}`);
}

export function cityGmlEntryInfo(name) { return byName.get(name); }
export function listCityGmlEntries(re) { return index.entries.filter(e => re.test(e.name)); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , name, out] = process.argv;
  const buf = await extractCityGmlEntry(name);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  console.log(`${name}: ${buf.length} bytes -> ${out}`);
}
