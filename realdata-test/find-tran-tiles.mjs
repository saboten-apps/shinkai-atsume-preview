// Parse tran_lod3 tileset.json (extracted via Range) and list LEAF tiles whose
// boundingVolume.region intersects the Numazu Port bbox (same as buildings).
import { extractEntry } from './extract-entry.mjs';
import { writeFileSync } from 'node:fs';

const BBOX = {
  west: 138.855 * Math.PI / 180, south: 35.080 * Math.PI / 180,
  east: 138.862 * Math.PI / 180, north: 35.085 * Math.PI / 180,
};

function regionIntersects(region) {
  if (!region) return false;
  const [w, s, e, n] = region;
  return w <= BBOX.east && e >= BBOX.west && s <= BBOX.north && n >= BBOX.south;
}

function walk(tile, path, leaves) {
  const uri = tile.content?.uri || tile.content?.url;
  const kids = tile.children || [];
  if (uri && kids.length === 0) {
    leaves.push({ uri, region: tile.boundingVolume?.region || null, path });
    return;
  }
  kids.forEach((c, i) => walk(c, `${path}/${i}`, leaves));
}

const buf = await extractEntry('tran_lod3/tileset.json');
const ts = JSON.parse(buf.toString('utf8'));
const leaves = [];
walk(ts.root, 'root', leaves);
const hits = leaves.filter(l => regionIntersects(l.region));
const result = {
  tran_lod3: {
    totalLeaves: leaves.length,
    portTiles: hits.map(h => ({ uri: h.uri, region: h.region })),
  },
};
console.log(`tran_lod3: total leaf tiles=${leaves.length}, intersecting port bbox=${hits.length}`);
for (const h of hits) console.log('  ', h.uri);
writeFileSync(new URL('./tran-tiles.json', import.meta.url), JSON.stringify(result, null, 1));
