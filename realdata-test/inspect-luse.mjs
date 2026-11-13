// Inspect luse MVT tiles covering the port bbox: enumerate layers, feature
// types, and the distinct luse:class / luse:class_code values with counts.
import { extractEntry, entryInfo } from './extract-entry.mjs';
import { decodeTile, lon2tileX, lat2tileY } from './mvt-decode.mjs';

const Z = 15;
const BBOX = { west: 138.855, south: 35.080, east: 138.862, north: 35.085 };
const x0 = lon2tileX(BBOX.west, Z), x1 = lon2tileX(BBOX.east, Z);
const y0 = lat2tileY(BBOX.north, Z), y1 = lat2tileY(BBOX.south, Z);
console.log(`z${Z} tiles: x ${x0}..${x1}, y ${y0}..${y1}`);

const classCounts = new Map();
let totalFeatures = 0, totalTiles = 0;
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
  const name = `luse/${Z}/${x}/${y}.mvt`;
  if (!entryInfo(name)) { console.log(`${name}: NOT in zip`); continue; }
  const buf = await extractEntry(name);
  totalTiles++;
  const layers = decodeTile(buf);
  for (const layer of layers) {
    console.log(`${name}: layer=${layer.name} extent=${layer.extent} features=${layer.features.length} bytes=${buf.length} gz=${buf[0] === 0x1f}`);
    for (const f of layer.features) {
      totalFeatures++;
      let cls = '(none)', code = '(none)';
      try { const a = JSON.parse(f.tags.attributes || '{}'); cls = a['luse:class'] || cls; code = a['luse:class_code'] || code; } catch {}
      const key = `${code} = ${cls} (geomType ${f.type})`;
      classCounts.set(key, (classCounts.get(key) || 0) + 1);
    }
  }
}
console.log(`tiles decoded: ${totalTiles}, features: ${totalFeatures}`);
console.log('distinct luse classes in port tiles:');
[...classCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log('  ', k, 'x' + c));
