// Part B: extract WATER polygons from the PLATEAU `luse` MVT theme.
//  - luse exists ONLY as MVT (XYZ tiles z8..15) in the 3D Tiles ZIP.
//  - Decoding notes: tiles use protobuf with the *v1* Feature field numbering
//    (see mvt-decode.mjs); each feature has a single `attributes` string
//    property holding JSON with `luse:class` / `luse:class_code`.
//  - Water class (enumerated over the 4 port tiles): code 204 =
//    水面（河川水面、湖沼、ため池、用水路、濠、運河水面）. Code 205
//    (その他自然地: 河川敷・河原・海浜・湖岸) is NOT open water and is excluded.
//  - MVT carries no height: output is flat at y = 0 (relative). The renderer
//    must place it at the frame's water level (river ~41.55, sea ~41.5 in the
//    ENU frame where ground ~= 41.7). See RESULT.md section 10.
//  - Rings are grouped into polygons by containment nesting (winding-agnostic),
//    triangulated with earcut, vertices converted tile -> lon/lat -> local ENU
//    (origin lat 35.0815, lon 138.8576; x=east, y=up, z=-north).
import { extractEntry, entryInfo } from './extract-entry.mjs';
import { decodeTile, lon2tileX, lat2tileY, tileToLonLat } from './mvt-decode.mjs';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const earcut = require('earcut').default || require('earcut');

// ---------- ECEF -> ENU helpers (same as other converters) ----------
const A = 6378137.0, F = 1 / 298.257223563, E2 = F * (2 - F);
const LAT0 = 35.0815 * Math.PI / 180, LON0 = 138.8576 * Math.PI / 180;
function geodeticToEcef(lat, lon, h) {
  const s = Math.sin(lat), N = A / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * Math.cos(lat) * Math.cos(lon), (N + h) * Math.cos(lat) * Math.sin(lon), (N * (1 - E2) + h) * s];
}
const P0 = geodeticToEcef(LAT0, LON0, 0);
const [sP, cP, sL, cL] = [Math.sin(LAT0), Math.cos(LAT0), Math.sin(LON0), Math.cos(LON0)];
function lonLatToEnu(lonDeg, latDeg) {
  const p = geodeticToEcef(latDeg * Math.PI / 180, lonDeg * Math.PI / 180, 0);
  const dx = p[0] - P0[0], dy = p[1] - P0[1], dz = p[2] - P0[2];
  return [-sL * dx + cL * dy, sP * cL * dx + sP * sL * dy - cP * dz]; // [east, -north] = [x, z]
}

// ---------- ring utilities ----------
function ringArea(pts) { // shoelace, tile coords
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  return a / 2;
}
function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Group a feature's rings into polygons via containment depth:
// even depth -> outer ring, odd depth -> hole of the smallest containing outer.
function groupPolygons(rings) {
  const rs = rings.filter(r => r.length >= 4).map(pts => ({ pts, area: Math.abs(ringArea(pts)) }));
  rs.sort((a, b) => b.area - a.area);
  const polys = []; // {outer, holes: []}
  const depthOf = rs.map((r, i) => {
    let d = 0;
    for (let j = 0; j < rs.length; j++) if (j !== i && rs[j].area > r.area && pointInRing(r.pts[0], rs[j].pts)) d++;
    return d;
  });
  rs.forEach((r, i) => { if (depthOf[i] % 2 === 0) { r.polyIndex = polys.length; polys.push({ outer: r, holes: [] }); } });
  rs.forEach((r, i) => {
    if (depthOf[i] % 2 === 1) {
      // hole: assign to the smallest-area outer ring containing it
      let best = null;
      for (const p of polys) if (pointInRing(r.pts[0], p.outer.pts) && (!best || p.outer.area < best.outer.area)) best = p;
      if (best) best.holes.push(r); else { r.polyIndex = polys.length; polys.push({ outer: r, holes: [] }); }
    }
  });
  return polys;
}

// ---------- main ----------
const Z = 15;
const BBOX = { west: 138.855, south: 35.080, east: 138.862, north: 35.085 };
const x0 = lon2tileX(BBOX.west, Z), x1 = lon2tileX(BBOX.east, Z);
const y0 = lat2tileY(BBOX.north, Z), y1 = lat2tileY(BBOX.south, Z);
const WATER_CODES = new Set(['204']);

const outPos = [], outIdx = [];
let vBase = 0;
let waterFeatures = 0, waterPolys = 0, waterRings = 0, skippedDegenerate = 0;
let coordMin = [Infinity, Infinity], coordMax = [-Infinity, -Infinity];
const min = [Infinity, Infinity], max = [-Infinity, -Infinity]; // ENU x/z range
const perTile = [];

for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
  const name = `luse/${Z}/${tx}/${ty}.mvt`;
  if (!entryInfo(name)) { perTile.push({ name, missing: true }); continue; }
  const buf = await extractEntry(name);
  const layers = decodeTile(buf);
  let tileWater = 0;
  for (const layer of layers) {
    if (layer.name !== 'luse') continue;
    for (const f of layer.features) {
      if (f.type !== 3) continue;
      for (const ring of f.parts) for (const p of ring) {
        if (p[0] < coordMin[0]) coordMin[0] = p[0]; if (p[0] > coordMax[0]) coordMax[0] = p[0];
        if (p[1] < coordMin[1]) coordMin[1] = p[1]; if (p[1] > coordMax[1]) coordMax[1] = p[1];
      }
      let code = null;
      try { code = JSON.parse(f.tags.attributes || '{}')['luse:class_code']; } catch {}
      if (!WATER_CODES.has(code)) continue;
      tileWater++; waterFeatures++;
      const polys = groupPolygons(f.parts);
      for (const poly of polys) {
        // convert rings to ENU (drop the duplicated closing point)
        const ringsEnu = [poly.outer, ...poly.holes].map(r => {
          const pts = r.pts.slice(0, -1).map(([px, py]) => {
            const [lon, lat] = tileToLonLat(px, py, layer.extent, tx, ty, Z);
            return lonLatToEnu(lon, lat);
          });
          return pts;
        });
        const flat = [], holeIdx = [];
        let vc = 0;
        ringsEnu.forEach((pts, ri) => {
          if (ri > 0) holeIdx.push(vc);
          for (const [x, z] of pts) { flat.push(x, z); vc++; }
        });
        if (vc < 3) { skippedDegenerate++; continue; }
        const tris = earcut(flat, holeIdx.length ? holeIdx : null, 2);
        if (!tris.length) { skippedDegenerate++; continue; }
        for (let i = 0; i < vc; i++) {
          const x = flat[i * 2], z = flat[i * 2 + 1];
          outPos.push(x, 0, z);
          if (x < min[0]) min[0] = x; if (x > max[0]) max[0] = x;
          if (z < min[1]) min[1] = z; if (z > max[1]) max[1] = z;
        }
        for (let i = 0; i < tris.length; i += 3) {
          let [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
          // enforce upward (+y) normal: cross(b-a, c-a).y > 0
          const ax = flat[a * 2], az = flat[a * 2 + 1], bx = flat[b * 2], bz = flat[b * 2 + 1], cx = flat[c * 2], cz = flat[c * 2 + 1];
          const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
          if (ny < 0) { const t = b; b = c; c = t; }
          outIdx.push(vBase + a, vBase + b, vBase + c);
        }
        vBase += vc;
        waterPolys++; waterRings += ringsEnu.length;
      }
    }
  }
  perTile.push({ name, waterFeatures: tileWater });
  console.log(`${name}: water features=${tileWater}`);
}

const totVerts = outPos.length / 3, totTris = outIdx.length / 3;
const positions = Float32Array.from(outPos);
const normals = new Float32Array(totVerts * 3);
for (let i = 0; i < totVerts; i++) normals.set([0, 1, 0], i * 3);
const indices = Uint32Array.from(outIdx);

// GLB assembly (single flat mesh)
const binChunks = []; const views = []; const accessors = [];
const push = (arr, type, compType, count) => {
  let bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  while (bytes.length % 4) bytes = Buffer.concat([bytes, Buffer.alloc(1)]);
  const off = binChunks.reduce((s, b) => s + b.length, 0);
  binChunks.push(bytes);
  views.push({ buffer: 0, byteOffset: off, byteLength: bytes.length });
  const acc = { bufferView: views.length - 1, componentType: compType, count, type };
  accessors.push(acc); return acc;
};
const posAcc = push(positions, 'VEC3', 5126, totVerts);
posAcc.min = [min[0], 0, min[1]]; posAcc.max = [max[0], 0, max[1]];
push(normals, 'VEC3', 5126, totVerts);
push(indices, 'SCALAR', 5125, totTris * 3);
const binBuf = Buffer.concat(binChunks);
const gltfJson = {
  asset: { version: '2.0', generator: 'plateau-luse-mvt-to-glb water (shinkai-atsume realdata-test)', extras: { source: 'PLATEAU 3D Tiles Numazu City 2021, luse (land use) MVT z15, class_code 204 (water surface: rivers, lakes, ponds, channels, canals)', frame: 'local ENU, origin lat 35.0815 lon 138.8576 h 0 (WGS84); x=east, y=up, z=-north', heightNote: 'MVT has no height attribute; mesh is flat at y=0 (relative). Renderer must offset: river surfaces ~41.55, sea surfaces ~41.5 in the ENU frame where ground ~= 41.7.' } },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'numazu-port-water-luse204' }],
  meshes: [{ name: 'water_luse204', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0, mode: 4 }] }],
  materials: [{ name: 'water-surface', pbrMetallicRoughness: { baseColorFactor: [0.10, 0.23, 0.36, 1.0], metallicFactor: 0.0, roughnessFactor: 0.35 } }],
  accessors, bufferViews: views, buffers: [{ byteLength: binBuf.length }],
};
const jsonStr = JSON.stringify(gltfJson);
const jsonBuf = Buffer.from(jsonStr, 'utf8');
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + binBuf.length;
const head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length + jsonPad, 0); jh.write('JSON', 4, 'ascii');
const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.write('BIN\0', 4, 'ascii');
const glb = Buffer.concat([head, jh, jsonBuf, Buffer.alloc(jsonPad, 0x20), bh, binBuf]);
writeFileSync(new URL('./port-water.glb', import.meta.url), glb);
const stats = {
  theme: 'luse_water_mvt', waterClassCode: '204', waterClass: '水面（河川水面、湖沼、ため池、用水路、濠、運河水面）',
  tiles: perTile, waterFeatures, waterPolygons: waterPolys, waterRings, skippedDegenerate,
  tileCoordRange: { min: coordMin, max: coordMax },
  vertices: totVerts, triangles: totTris, glbBytes: glb.length,
  enuRange: { x: [min[0], max[0]], z: [min[1], max[1]], y: 0 },
};
writeFileSync(new URL('./convert-water-stats.json', import.meta.url), JSON.stringify(stats, null, 1));
console.log(`== water: features=${waterFeatures} polys=${waterPolys} rings=${waterRings} verts=${totVerts} tris=${totTris} glb=${glb.length}`);
console.log(`   tile coord range: [${coordMin}] .. [${coordMax}] (extent header says 131072)`);
console.log(`   ENU range: x ${min[0].toFixed(1)}..${max[0].toFixed(1)}, z ${min[1].toFixed(1)}..${max[1].toFixed(1)} (y=0 flat)`);
