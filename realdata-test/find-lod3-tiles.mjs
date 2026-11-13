// Walk bldg_lod3/tileset.json (already Range-extracted to scratch) and list
// leaf tiles whose boundingVolume.region intersects the port bbox.
// Mirrors find-port-tiles.mjs logic. Also writes lod3-tiles.json.
import { readFileSync, writeFileSync } from 'node:fs';

const BBOX = {
  west: 138.855 * Math.PI / 180, south: 35.080 * Math.PI / 180,
  east: 138.862 * Math.PI / 180, north: 35.085 * Math.PI / 180,
};
function regionIntersects(region) {
  if (!region) return false;
  const [w, s, e, n] = region;
  return w <= BBOX.east && e >= BBOX.west && s <= BBOX.north && n >= BBOX.south;
}
function walk(tile, leaves) {
  const uri = tile.content?.uri || tile.content?.url;
  const kids = tile.children || [];
  if (uri && kids.length === 0) { leaves.push({ uri, region: tile.boundingVolume?.region || null }); return; }
  kids.forEach(c => walk(c, leaves));
}
const ts = JSON.parse(readFileSync('/tmp/plateau-scratch/tex-inspect/lod3-tileset.json', 'utf8'));
const leaves = [];
walk(ts.root, leaves);
const hits = leaves.filter(l => regionIntersects(l.region));
console.log(`bldg_lod3: total leaf tiles=${leaves.length}, intersecting port bbox=${hits.length}`);
for (const h of hits) {
  const [w, s, e, n] = h.region || [];
  console.log('  ', h.uri, h.region ? `region lon ${(w * 180 / Math.PI).toFixed(5)}..${(e * 180 / Math.PI).toFixed(5)} lat ${(s * 180 / Math.PI).toFixed(5)}..${(n * 180 / Math.PI).toFixed(5)} h ${h.region[4]?.toFixed(1)}..${h.region[5]?.toFixed(1)}` : 'no region');
}
writeFileSync(new URL('./lod3-tiles.json', import.meta.url), JSON.stringify({ totalLeaves: leaves.length, portTiles: hits }, null, 1));
