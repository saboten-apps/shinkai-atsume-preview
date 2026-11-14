// Round 3 / D4 support: split the luse class-204 water polygons (same source
// and polygon reconstruction as convert-luse-water.mjs) into SEA and RIVER
// meshes with baked vertex colors, per DESIGN-astra-round3.md:
//  - Split heuristic (documented as such; refined 2026-11-12, see
//    RESULT.md section 11.3): polygons with area >= 30,000 m^2 are forced
//    to sea/harbor regardless of centroid (broad open-water polygons have
//    unreliable centroids); smaller polygons use centroid ENU x > 100 ->
//    river (Kano River side, east), else sea/harbor.
//  - Sea: flat vertex color #183B52.
//  - River: per-vertex gradient — #183B52 at the river-mouth point
//    (219, -411), blending to #527B78 over the last ~40 m of distance to the
//    mouth (d >= 40 m from the mouth -> full #527B78).
//  - y stays 0 (relative); the renderer places sea ~41.5 / river ~41.55.
// Colors live in COLOR_0; the material base color is white, so renderers
// must apply vertex colors (three.js: vertexColors = true for custom
// materials; GLTFLoader-based standard materials pick COLOR_0 up when
// vertexColors is enabled on the material).
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

// ---------- ring utilities (identical to convert-luse-water.mjs) ----------
function ringArea(pts) {
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
function groupPolygons(rings) {
  const rs = rings.filter(r => r.length >= 4).map(pts => ({ pts, area: Math.abs(ringArea(pts)) }));
  rs.sort((a, b) => b.area - a.area);
  const polys = [];
  const depthOf = rs.map((r, i) => {
    let d = 0;
    for (let j = 0; j < rs.length; j++) if (j !== i && rs[j].area > r.area && pointInRing(r.pts[0], rs[j].pts)) d++;
    return d;
  });
  rs.forEach((r, i) => { if (depthOf[i] % 2 === 0) { r.polyIndex = polys.length; polys.push({ outer: r, holes: [] }); } });
  rs.forEach((r, i) => {
    if (depthOf[i] % 2 === 1) {
      let best = null;
      for (const p of polys) if (pointInRing(r.pts[0], p.outer.pts) && (!best || p.outer.area < best.outer.area)) best = p;
      if (best) best.holes.push(r); else { r.polyIndex = polys.length; polys.push({ outer: r, holes: [] }); }
    }
  });
  return polys;
}

// ---------- polygon area / centroid in ENU (x,z), holes subtracted ----------
function ringAreaCentroid(pts) { // pts: [[x,z],...] without duplicated closing point
  let a2 = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
    const cr = x0 * z1 - x1 * z0;
    a2 += cr; cx += (x0 + x1) * cr; cz += (z0 + z1) * cr;
  }
  const area = a2 / 2; // signed
  if (Math.abs(area) < 1e-9) return { area: 0, cx: pts[0][0], cz: pts[0][1] };
  // centroid = sum / (6A) = sum / (3 * a2); signs cancel correctly for either winding
  return { area: Math.abs(area), cx: cx / (3 * a2), cz: cz / (3 * a2) };
}
function polyAreaCentroid(ringsEnu) {
  const parts = ringsEnu.map((pts, ri) => {
    const rc = ringAreaCentroid(pts);
    return { ...rc, sign: ri === 0 ? 1 : -1 };
  });
  let area = 0, mx = 0, mz = 0;
  for (const p of parts) { area += p.sign * p.area; mx += p.sign * p.area * p.cx; mz += p.sign * p.area * p.cz; }
  if (area <= 0) { const [x, z] = ringsEnu[0][0]; return { area: 0, cx: x, cz: z }; }
  return { area, cx: mx / area, cz: mz / area };
}

// ---------- colors ----------
const SEA_RGB = [0x18 / 255, 0x3B / 255, 0x52 / 255];   // #183B52
const RIVER_RGB = [0x52 / 255, 0x7B / 255, 0x78 / 255]; // #527B78
const MOUTH = { x: 219, z: -411 };
const BLEND_M = 40;
function riverColorAt(x, z) {
  const d = Math.hypot(x - MOUTH.x, z - MOUTH.z);
  const t = Math.min(1, d / BLEND_M); // 0 at mouth -> sea color; >=40m -> river color
  return [
    SEA_RGB[0] + (RIVER_RGB[0] - SEA_RGB[0]) * t,
    SEA_RGB[1] + (RIVER_RGB[1] - SEA_RGB[1]) * t,
    SEA_RGB[2] + (RIVER_RGB[2] - SEA_RGB[2]) * t,
  ];
}

// ---------- GLB writer ----------
function buildGlb({ positions, colors, indices, nodeName, meshName, materialName, extras }) {
  const totVerts = positions.length / 3, totTris = indices.length / 3;
  const normals = new Float32Array(totVerts * 3);
  for (let i = 0; i < totVerts; i++) normals.set([0, 1, 0], i * 3);
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < totVerts; i++) for (let k = 0; k < 3; k++) {
    const v = positions[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v;
  }
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
  const posAcc = push(Float32Array.from(positions), 'VEC3', 5126, totVerts); posAcc.min = min; posAcc.max = max;
  push(normals, 'VEC3', 5126, totVerts);
  push(Float32Array.from(colors), 'VEC3', 5126, totVerts);
  push(Uint32Array.from(indices), 'SCALAR', 5125, totTris * 3);
  const binBuf = Buffer.concat(binChunks);
  const gltfJson = {
    asset: { version: '2.0', generator: 'plateau-luse-mvt-to-glb water-split (shinkai-atsume realdata-test)', extras },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: nodeName }],
    meshes: [{ name: meshName, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
    materials: [{ name: materialName, pbrMetallicRoughness: { baseColorFactor: [1.0, 1.0, 1.0, 1.0], metallicFactor: 0.0, roughnessFactor: 0.35 } }],
    accessors, bufferViews: views, buffers: [{ byteLength: binBuf.length }],
  };
  const jsonBuf = Buffer.from(JSON.stringify(gltfJson), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + binBuf.length;
  const head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length + jsonPad, 0); jh.write('JSON', 4, 'ascii');
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.write('BIN\0', 4, 'ascii');
  return { glb: Buffer.concat([head, jh, jsonBuf, Buffer.alloc(jsonPad, 0x20), bh, binBuf]), min, max, totVerts, totTris };
}

// ---------- main ----------
const Z = 15;
const BBOX = process.env.STATION_CORRIDOR ? { west: 138.850, south: 35.078, east: 138.869, north: 35.106 } : { west: 138.855, south: 35.080, east: 138.862, north: 35.085 };
const outputPrefix = process.env.STATION_CORRIDOR ? 'corridor' : 'port';
const x0 = lon2tileX(BBOX.west, Z), x1 = lon2tileX(BBOX.east, Z);
const y0 = lat2tileY(BBOX.north, Z), y1 = lat2tileY(BBOX.south, Z);
const WATER_CODES = new Set(['204']);
const SPLIT_X = 100; // heuristic (small polys): centroid ENU x > 100 -> river
const SEA_AREA_MIN = 30000; // m^2: polygons at least this large are always sea/harbor

const acc = {
  sea: { pos: [], col: [], idx: [], polys: 0, area: 0 },
  river: { pos: [], col: [], idx: [], polys: 0, area: 0 },
};
let waterFeatures = 0, totalPolys = 0, skippedDegenerate = 0;
const riverPolyList = [], seaPolyList = [];

for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
  const name = `luse/${Z}/${tx}/${ty}.mvt`;
  if (!entryInfo(name)) continue;
  const buf = await extractEntry(name);
  const layers = decodeTile(buf);
  for (const layer of layers) {
    if (layer.name !== 'luse') continue;
    for (const f of layer.features) {
      if (f.type !== 3) continue;
      let code = null;
      try { code = JSON.parse(f.tags.attributes || '{}')['luse:class_code']; } catch {}
      if (!WATER_CODES.has(code)) continue;
      waterFeatures++;
      const polys = groupPolygons(f.parts);
      for (const poly of polys) {
        const ringsEnu = [poly.outer, ...poly.holes].map(r => r.pts.slice(0, -1).map(([px, py]) => {
          const [lon, lat] = tileToLonLat(px, py, layer.extent, tx, ty, Z);
          return lonLatToEnu(lon, lat);
        }));
        const { area, cx, cz } = polyAreaCentroid(ringsEnu);
        const cls = area >= SEA_AREA_MIN ? 'sea' : (cx > SPLIT_X ? 'river' : 'sea');
        const flat = [], holeIdx = [];
        let vc = 0;
        ringsEnu.forEach((pts, ri) => {
          if (ri > 0) holeIdx.push(vc);
          for (const [x, z] of pts) { flat.push(x, z); vc++; }
        });
        if (vc < 3) { skippedDegenerate++; continue; }
        const tris = earcut(flat, holeIdx.length ? holeIdx : null, 2);
        if (!tris.length) { skippedDegenerate++; continue; }
        const A = acc[cls];
        const vBase = A.pos.length / 3;
        for (let i = 0; i < vc; i++) {
          const x = flat[i * 2], z = flat[i * 2 + 1];
          A.pos.push(x, 0, z);
          const rgb = cls === 'sea' ? SEA_RGB : riverColorAt(x, z);
          A.col.push(rgb[0], rgb[1], rgb[2]);
        }
        for (let i = 0; i < tris.length; i += 3) {
          let [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
          const ax = flat[a * 2], az = flat[a * 2 + 1], bx = flat[b * 2], bz = flat[b * 2 + 1], cxp = flat[c * 2], czp = flat[c * 2 + 1];
          const ny = (bz - az) * (cxp - ax) - (bx - ax) * (czp - az);
          if (ny < 0) { const t = b; b = c; c = t; }
          A.idx.push(vBase + a, vBase + b, vBase + c);
        }
        A.polys++; A.area += area;
        totalPolys++;
        (cls === 'river' ? riverPolyList : seaPolyList).push({ cx: +cx.toFixed(1), cz: +cz.toFixed(1), areaM2: +area.toFixed(0) });
      }
    }
  }
}

const frameNote = 'local ENU, origin lat 35.0815 lon 138.8576 h 0 (WGS84); x=east, y=up, z=-north';
const heightNote = 'MVT has no height attribute; mesh is flat at y=0 (relative). Renderer must offset: sea ~41.5, river ~41.55 in the ENU frame where ground ~= 41.7. COLOR_0 carries the water color; material base color is white — renderers must apply vertex colors.';
const seaOut = buildGlb({
  positions: acc.sea.pos, colors: acc.sea.col, indices: acc.sea.idx,
  nodeName: 'numazu-port-water-sea', meshName: 'water_sea', materialName: 'water-sea-vertexcolor',
  extras: { source: 'PLATEAU 3D Tiles Numazu City 2021, luse (land use) MVT z15, class_code 204 (water surface), split subset: sea/harbor — polygon area >= 30000 m2 (forced, overrides centroid) or centroid ENU x <= 100', frame: frameNote, heightNote, coloring: 'flat vertex color #183B52 (Astra round-3 design, DESIGN-astra-round3.md)' },
});
writeFileSync(new URL(`./${outputPrefix}-water-sea.glb`, import.meta.url), seaOut.glb);
const riverOut = buildGlb({
  positions: acc.river.pos, colors: acc.river.col, indices: acc.river.idx,
  nodeName: 'numazu-port-water-river', meshName: 'water_river', materialName: 'water-river-vertexcolor',
  extras: { source: 'PLATEAU 3D Tiles Numazu City 2021, luse (land use) MVT z15, class_code 204 (water surface), split subset: river — polygon area < 30000 m2 and centroid ENU x > 100 (Kano River side, east)', frame: frameNote, heightNote, coloring: 'per-vertex gradient (Astra round-3 design): #183B52 at the river-mouth point (219,-411), blending to #527B78 over the last 40 m of distance to the mouth; vertices >= 40 m from the mouth are full #527B78' },
});
writeFileSync(new URL(`./${outputPrefix}-water-river.glb`, import.meta.url), riverOut.glb);

const stats = {
  theme: 'luse_water_split', waterClassCode: '204',
  splitRule: 'polygon area >= 30000 m2 -> sea/harbor (forced, overrides centroid); else polygon centroid ENU x > 100 -> river (Kano River side); else sea/harbor (heuristic, refined 2026-11-12)',
  seaAreaMinM2: SEA_AREA_MIN,
  mouthPoint: MOUTH, blendMeters: BLEND_M,
  waterFeatures, totalPolygons: totalPolys, skippedDegenerate,
  sea: { polygons: acc.sea.polys, areaM2: +acc.sea.area.toFixed(0), vertices: seaOut.totVerts, triangles: seaOut.totTris, glbBytes: seaOut.glb.length, enuRange: { min: seaOut.min, max: seaOut.max } },
  river: { polygons: acc.river.polys, areaM2: +acc.river.area.toFixed(0), vertices: riverOut.totVerts, triangles: riverOut.totTris, glbBytes: riverOut.glb.length, enuRange: { min: riverOut.min, max: riverOut.max } },
  totalAreaM2: +(acc.sea.area + acc.river.area).toFixed(0),
  riverPolygons: riverPolyList.sort((a, b) => b.areaM2 - a.areaM2),
  seaPolygonsTop: seaPolyList.sort((a, b) => b.areaM2 - a.areaM2).slice(0, 8),
};
writeFileSync(new URL(`./${outputPrefix}-water-stats.json`, import.meta.url), JSON.stringify(stats, null, 1));
console.log(`== water-split: features=${waterFeatures} polys=${totalPolys} (sea=${acc.sea.polys} river=${acc.river.polys}) skipped=${skippedDegenerate}`);
console.log(`   sea:   area=${stats.sea.areaM2} m2 verts=${seaOut.totVerts} tris=${seaOut.totTris} glb=${seaOut.glb.length}`);
console.log(`   river: area=${stats.river.areaM2} m2 verts=${riverOut.totVerts} tris=${riverOut.totTris} glb=${riverOut.glb.length}`);
console.log(`   river polys (centroid, area): ${JSON.stringify(stats.riverPolygons)}`);
