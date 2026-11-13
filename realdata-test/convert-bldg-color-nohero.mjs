// Round-4 companion of convert-bldg-color.mjs: the round-3 colored buildings
// EXCLUDING every hero building that is in port-bldg-hero-tex.glb (to avoid
// double geometry when the renderer combines both files), and WITH the
// Astra-design D2 individual color overrides (個別指定) applied to hero
// buildings that are NOT in the hero-tex GLB (texture-less heroes, or heroes
// dropped for the texture budget) when they lie within a landmark area:
//   びゅうお area   wall #EDEBE4 / roof #5B7186
//   深海水族館 area wall #D8D5CC / roof #2E4A5A
//   魚市場 area     wall #D5D9DB / roof #6E7F8A
// Overrides are exact (no per-building hash lightness modulation).
// NOTE (measured round 4): all 49 selected heroes had usable textures and
// fit the budget, so the override set is EMPTY for this dataset — the logic
// is implemented and reported, it simply has no building to act on.
// Hero selection is read from hero-selection.json (convert-bldg-hero.mjs).
// Everything else is identical to convert-bldg-color.mjs:
// Usage/roof-wall colored rebuild of the Numazu Port bldg LOD2 data from the
// SAME local b3dm tiles as port-bldg-lod2-clean.glb
// (/tmp/plateau-scratch/tiles/lod2). Differences vs the clean rebuild:
//  - COLOR: per-building class color from the Astra round-3 palette, split
//    per-face into roof vs wall by face normal (normal.y > 0.5 -> roof).
//  - USAGE JOIN ATTEMPT (2026-11-12): the b3dm batch table carries `gml_id`
//    and it matches CityGML `gml:id` for 525/525 buildings, BUT the Numazu
//    2021 CityGML bldg records contain NO usage attribute at all (full tag
//    census of meshes 52384698/52385608: only class, measuredHeight,
//    buildingID, surveyYear, disaster-risk and data-quality attributes;
//    zero hits for bldg:usage / bldg:function / gen:stringAttribute / 用途).
//    Classification is therefore impossible from source data, so ALL
//    buildings use the 不明 (unknown) palette below. No usages were invented.
//    See RESULT.md section 11.
// Original clean-rebuild notes follow:
//  - b3dm -> embedded GLB -> Draco decode (positions, normals, _BATCHID)
//  - ECEF -> ENU at origin lat 35.0815, lon 138.8576, h=0 (x=east, y=up, z=-north)
//  - FRAME FIX (found 2026-11-12): b3dm local coords are glTF Y-up; the
//    ECEF offset must use the up-axis conversion (lx, -lz, ly) (normals too).
//    The earlier building GLBs omitted it, which smeared heights by tens of
//    meters. With the fix, port building bases cluster at y ~= +41.7 m
//    (ellipsoidal; this frame's ground level). See RESULT.md addendum.
//  - CLEANING (thresholds are GROUND-RELATIVE, ground G = 41.7 m):
//    (a) drop every triangle with any vertex above G+60 = 101.7 m
//    (removes the known ~128 m source artifact; legit buildings are <= ~40 m
//    tall, i.e. tops <= ~82 m in this frame)
//    (b) clamp vertex y to >= G-2 = 39.7 m (lifts below-grade solid bases)
//    The originally briefed absolute thresholds (60 m / -2 m) assumed ground
//    at y=0; their impact in the corrected frame is counted and reported
//    separately (they would have cut every building taller than ~18 m).
//  - COLOR: per-building tint baked into COLOR_0. Buildings are keyed by
//    (tile file, _BATCHID); each gets the base paper color #EEE8DC with its
//    HSL lightness scaled by a deterministic factor in [0.94, 1.06]
//    (FNV-1a hash of the key). Material is plain white, so renderers must
//    apply vertex colors (glTF COLOR_0 semantics; three.js: vertexColors).
//  - Output is de-indexed triangle soup of the KEPT triangles only, so the
//    vertex count change reflects the filter exactly.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseB3dm, parseGlb } from './inspect-b3dm.mjs';

const require = createRequire(import.meta.url);
const draco3d = require('draco3d');

// ---------- WGS84 ECEF -> ENU (same as convert-b3dm-to-glb.mjs) ----------
const A = 6378137.0, F = 1 / 298.257223563, E2 = F * (2 - F);
const LAT0 = 35.0815 * Math.PI / 180, LON0 = 138.8576 * Math.PI / 180;
function geodeticToEcef(lat, lon, h) {
  const s = Math.sin(lat), N = A / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * Math.cos(lat) * Math.cos(lon),
          (N + h) * Math.cos(lat) * Math.sin(lon),
          (N * (1 - E2) + h) * s];
}
const P0 = geodeticToEcef(LAT0, LON0, 0);
const [sP, cP, sL, cL] = [Math.sin(LAT0), Math.cos(LAT0), Math.sin(LON0), Math.cos(LON0)];
function ecefToEnu(dx, dy, dz, out, o) {
  out[o]     = -sL * dx + cL * dy;
  out[o + 1] = cP * cL * dx + cP * sL * dy + sP * dz;
  out[o + 2] = sP * cL * dx + sP * sL * dy - cP * dz;
}
function rotateNormal(nx, ny, nz, out, o) {
  out[o]     = -sL * nx + cL * ny;
  out[o + 1] = cP * cL * nx + cP * sL * ny + sP * nz;
  out[o + 2] = sP * cL * nx + sP * sL * ny - cP * nz;
}

// ---------- 4x4 helpers ----------
function matFromNode(node) {
  if (node.matrix) return Float64Array.from(node.matrix);
  const t = node.translation || [0, 0, 0], r = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
function matMul(a, b) {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const IDENTITY = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function applyMat(m, v, o, out) {
  const x = v[o], y = v[o + 1], z = v[o + 2];
  out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
  out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
  out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
}

function readAccessor(json, bin, idx) {
  const acc = json.accessors[idx];
  const bv = json.bufferViews[acc.bufferView];
  const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const comp = { 5126: [Float32Array, 4], 5125: [Uint32Array, 4], 5123: [Uint16Array, 2], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5120: [Int8Array, 1] }[acc.componentType];
  const ncomp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const [TA, sz] = comp;
  const stride = bv.byteStride && bv.byteStride !== ncomp * sz ? bv.byteStride : ncomp * sz;
  const out = new TA(acc.count * ncomp);
  for (let i = 0; i < acc.count; i++) {
    const src = new TA(bin.buffer, bin.byteOffset + off + i * stride, ncomp);
    out.set(src, i * ncomp);
  }
  return out;
}

// ---------- per-building tint ----------
function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : (l > 0.5 ? d / (2 - max - min) : d / (max + min));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0]; else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x]; else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c]; else rgb = [c, 0, x];
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}
// Astra round-3 palette (DESIGN-astra-round3.md). Usage classification was
// impossible (no usage attribute in source), so only 不明 is used; the other
// classes are kept here for the record / future data.
const PALETTE = {
  commercial: { wall: [0xD7 / 255, 0xC8 / 255, 0xB5 / 255], roof: [0x82 / 255, 0x77 / 255, 0x6C / 255] }, // 商業・店舗系
  residential: { wall: [0xD9 / 255, 0xD4 / 255, 0xCA / 255], roof: [0x64 / 255, 0x6A / 255, 0x70 / 255] }, // 住宅系
  warehouse: { wall: [0xC5 / 255, 0xCC / 255, 0xCF / 255], roof: [0x73 / 255, 0x82 / 255, 0x8B / 255] }, // 倉庫・工場・港湾系
  public: { wall: [0xE6 / 255, 0xE0 / 255, 0xD3 / 255], roof: [0x85 / 255, 0x8A / 255, 0x89 / 255] }, // 公共・文化系
  unknown: { wall: [0xCF / 255, 0xCE / 255, 0xC8 / 255], roof: [0x77 / 255, 0x7C / 255, 0x7C / 255] }, // 不明
};
function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) / 4294967296;
}
const tintCache = new Map();
function classColorsFor(key) {
  // Per-building colors: class wall/roof colors with HSL lightness scaled by
  // the SAME deterministic factor scheme as the clean rebuild (FNV-1a hash of
  // (tile:batchId), lightness x [0.94, 1.06]).
  let c = tintCache.get(key);
  if (c) return c;
  const factor = 1 + (hash01(key) * 2 - 1) * 0.06;
  const adj = (rgb) => {
    const [h, s, l] = rgbToHsl(...rgb);
    return hslToRgb(h, s, Math.min(1, Math.max(0, l * factor)));
  };
  const p = PALETTE.unknown; // usage not present in source data -> all 不明
  c = { wall: adj(p.wall), roof: adj(p.roof) };
  tintCache.set(key, c);
  return c;
}

// ---------- round-4 hero exclusion + individual overrides ----------
const selection = JSON.parse(readFileSync(new URL('./hero-selection.json', import.meta.url), 'utf8'));
const excludeKeys = new Set(selection.heroTexKeptKeys);
const OVERRIDE_HEX = {
  'びゅうお': { wall: '#EDEBE4', roof: '#5B7186' },
  '深海水族館': { wall: '#D8D5CC', roof: '#2E4A5A' },
  '魚市場': { wall: '#D5D9DB', roof: '#6E7F8A' },
};
const hexRgb = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const overrideColors = new Map(); // key -> {wall, roof} exact colors
for (const h of selection.heroes) {
  if (h.status === 'hero-tex') continue;          // excluded entirely below
  if (!h.withinLandmarkArea) continue;            // overrides are per landmark area
  const p = OVERRIDE_HEX[h.nearestLandmark];
  if (p) overrideColors.set(h.key, { wall: hexRgb(p.wall), roof: hexRgb(p.roof), area: h.nearestLandmark, hex: p });
}
function colorsFor(key) {
  return overrideColors.get(key) || classColorsFor(key);
}

// ---------- decode ----------
const Draco = await draco3d.createDecoderModule({});

function decodePrimitive(json, bin, prim) {
  const ext = prim.extensions?.KHR_draco_mesh_compression;
  if (!ext) {
    const pos = readAccessor(json, bin, prim.attributes.POSITION);
    const nor = prim.attributes.NORMAL !== undefined ? readAccessor(json, bin, prim.attributes.NORMAL) : null;
    const bid = prim.attributes._BATCHID !== undefined ? readAccessor(json, bin, prim.attributes._BATCHID) : null;
    let idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices) : null;
    if (!idx) { idx = new Uint32Array(pos.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i; }
    return { positions: Float32Array.from(pos), normals: nor ? Float32Array.from(nor) : null, batchIds: bid ? Float32Array.from(bid) : null, indices: Uint32Array.from(idx) };
  }
  const bv = json.bufferViews[ext.bufferView];
  const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const decoder = new Draco.Decoder();
  const buffer = new Draco.DecoderBuffer();
  buffer.Init(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), bytes.byteLength);
  const gtype = decoder.GetEncodedGeometryType(buffer);
  if (gtype !== Draco.TRIANGULAR_MESH) throw new Error(`unexpected draco geometry type ${gtype}`);
  const mesh = new Draco.Mesh();
  const status = decoder.DecodeBufferToMesh(buffer, mesh);
  if (!status.ok() || mesh.num_points() === 0) throw new Error(`draco decode failed: ${status.error_msg()}`);
  const getAttr = (name) => {
    const uid = ext.attributes[name];
    if (uid === undefined) return null;
    const attr = decoder.GetAttributeByUniqueId(mesh, uid);
    if (!attr) return null;
    const arr = new Draco.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attr, arr);
    const n = arr.size();
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = arr.GetValue(i);
    Draco.destroy(arr);
    return out;
  };
  const positions = getAttr('POSITION');
  const normals = getAttr('NORMAL');
  const batchIds = getAttr('_BATCHID');
  const nFaces = mesh.num_faces();
  const indices = new Uint32Array(nFaces * 3);
  const face = new Draco.DracoInt32Array();
  for (let i = 0; i < nFaces; i++) {
    decoder.GetFaceFromMesh(mesh, i, face);
    indices[i * 3] = face.GetValue(0); indices[i * 3 + 1] = face.GetValue(1); indices[i * 3 + 2] = face.GetValue(2);
  }
  Draco.destroy(face); Draco.destroy(mesh); Draco.destroy(buffer); Draco.destroy(decoder);
  return { positions, normals, batchIds, indices };
}

function collectMeshInstances(json) {
  const out = [];
  const scene = json.scenes[json.scene || 0];
  const visit = (ni, parent) => {
    const node = json.nodes[ni];
    const world = matMul(parent, matFromNode(node));
    if (node.mesh !== undefined) out.push({ meshIndex: node.mesh, world });
    (node.children || []).forEach(c => visit(c, world));
  };
  scene.nodes.forEach(ni => visit(ni, IDENTITY));
  return out;
}

// ---------- main: decode -> ENU -> clean -> emit kept triangles ----------
const GROUND = 41.7;                 // measured port ground level in this ENU frame
const Y_MAX = GROUND + 60;           // 101.7 m: artifact ceiling
const Y_MIN = GROUND - 2;            // 39.7 m: base clamp floor
const LITERAL_Y_MAX = 60, LITERAL_Y_MIN = -2; // originally briefed absolute thresholds (impact counted only)
const dir = '/tmp/plateau-scratch/tiles/lod2';
const files = readdirSync(dir).filter(f => f.endsWith('.b3dm')).sort();
const outPos = [], outNor = [], outCol = []; // per emitted vertex (flat arrays appended per vertex)
let rawBytes = 0, trisBefore = 0, trisRemoved = 0, vertsBefore = 0, clampedPoints = 0;
let roofTris = 0, wallTris = 0;
let literalTrisAbove = 0, literalPointsBelow = 0;
const failed = [];
const buildingKeys = new Set();
let excludedHeroTris = 0;
const emittedKeys = new Set();
const buildingBase = new Map(); // key -> min y (ground contact estimate, pre-clamp)

for (const f of files) {
  const buf = readFileSync(`${dir}/${f}`);
  rawBytes += buf.length;
  try {
    const { gltf } = parseB3dm(buf);
    const { json, bin } = parseGlb(gltf);
    const center = json.extensions?.CESIUM_RTC?.center;
    if (!center) throw new Error('no CESIUM_RTC center');
    for (const inst of collectMeshInstances(json)) {
      const mesh = json.meshes[inst.meshIndex];
      for (const prim of mesh.primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const { positions, normals, batchIds, indices } = decodePrimitive(json, bin, prim);
        const n = positions.length / 3;
        vertsBefore += n;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
        const vkeys = new Array(n); // building key per vertex (color decided per face)
        const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          applyMat(inst.world, positions, i * 3, tmp);
          // glTF Y-up -> ECEF-offset up-axis conversion: (x, y, z) -> (x, -z, y)
          const ox = tmp[0], oy = -tmp[2], oz = tmp[1];
          const ex = center[0] + ox - P0[0], ey = center[1] + oy - P0[1], ez = center[2] + oz - P0[2];
          ecefToEnu(ex, ey, ez, pos, i * 3);
          if (pos[i * 3 + 1] < Y_MIN) clampedPoints++;
          if (pos[i * 3 + 1] < LITERAL_Y_MIN) literalPointsBelow++;
          if (normals) {
            const w = inst.world, keep = [w[12], w[13], w[14]];
            w[12] = 0; w[13] = 0; w[14] = 0;
            applyMat(w, normals, i * 3, tmp2);
            w[12] = keep[0]; w[13] = keep[1]; w[14] = keep[2];
            const len = Math.hypot(tmp2[0], tmp2[1], tmp2[2]) || 1;
            const nx = tmp2[0] / len, ny = -tmp2[2] / len, nz = tmp2[1] / len;
            rotateNormal(nx, ny, nz, nor, i * 3);
          } else { nor.set([0, 1, 0], i * 3); }
          const bid = batchIds ? Math.round(batchIds[i]) : 0;
          const key = `${f}:${bid}`;
          buildingKeys.add(key);
          vkeys[i] = key;
          const prevBase = buildingBase.get(key);
          if (prevBase === undefined || pos[i * 3 + 1] < prevBase) buildingBase.set(key, pos[i * 3 + 1]);
        }
        // triangle pass: filter > Y_MAX, clamp y, emit soup
        for (let t = 0; t < indices.length; t += 3) {
          trisBefore++;
          const a = indices[t], b = indices[t + 1], c = indices[t + 2];
          if (pos[a * 3 + 1] > LITERAL_Y_MAX || pos[b * 3 + 1] > LITERAL_Y_MAX || pos[c * 3 + 1] > LITERAL_Y_MAX) literalTrisAbove++;
          if (pos[a * 3 + 1] > Y_MAX || pos[b * 3 + 1] > Y_MAX || pos[c * 3 + 1] > Y_MAX) { trisRemoved++; continue; }
          // round 4: hero buildings shown textured live only in the hero-tex GLB
          if (excludeKeys.has(vkeys[a])) { excludedHeroTris++; continue; }
          emittedKeys.add(vkeys[a]);
          // roof/wall split by face normal (mean of the 3 ENU vertex normals)
          let fnx = nor[a * 3] + nor[b * 3] + nor[c * 3];
          let fny = nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1];
          let fnz = nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2];
          const fl = Math.hypot(fnx, fny, fnz) || 1;
          const isRoof = (fny / fl) > 0.5;
          if (isRoof) roofTris++; else wallTris++;
          const cc = colorsFor(vkeys[a]);
          const rgb = isRoof ? cc.roof : cc.wall;
          for (const vi of [a, b, c]) {
            outPos.push(pos[vi * 3], Math.max(pos[vi * 3 + 1], Y_MIN), pos[vi * 3 + 2]);
            outNor.push(nor[vi * 3], nor[vi * 3 + 1], nor[vi * 3 + 2]);
            outCol.push(rgb[0], rgb[1], rgb[2]);
          }
        }
      }
    }
    console.log(`lod2-color ${f}: ok`);
  } catch (e) {
    failed.push({ file: f, error: String(e.message || e) });
    console.log(`lod2-color ${f}: FAILED ${e.message || e}`);
  }
}

const totVerts = outPos.length / 3, totTris = totVerts / 3;
const positions = Float32Array.from(outPos), normals = Float32Array.from(outNor), colors = Float32Array.from(outCol);
const indices = new Uint32Array(totVerts);
for (let i = 0; i < totVerts; i++) indices[i] = i;
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < totVerts; i++) for (let k = 0; k < 3; k++) {
  const v = positions[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v;
}
// GLB assembly
const binChunks = [];
const views = [], accessors = [];
const push = (arr, type, compType, count) => {
  let bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  while (bytes.length % 4) bytes = Buffer.concat([bytes, Buffer.alloc(1)]);
  const off = binChunks.reduce((s, b) => s + b.length, 0);
  binChunks.push(bytes);
  views.push({ buffer: 0, byteOffset: off, byteLength: bytes.length });
  const acc = { bufferView: views.length - 1, componentType: compType, count, type };
  accessors.push(acc); return acc;
};
const posAcc = push(positions, 'VEC3', 5126, totVerts); posAcc.min = min; posAcc.max = max;
push(normals, 'VEC3', 5126, totVerts);
push(colors, 'VEC3', 5126, totVerts);
push(indices, 'SCALAR', 5125, totVerts);
const binBuf = Buffer.concat(binChunks);
const gltfJson = {
  asset: { version: '2.0', generator: 'plateau-b3dm-to-glb color-nohero (shinkai-atsume realdata-test, round 4)', extras: { source: 'PLATEAU 3D Tiles Numazu City 2021, bldg LOD2, cleaned (frame-corrected glTF Y-up axis conversion; ground level in frame y~=41.7m; triangles with any vertex above ground+60m=101.7m removed, y clamped to >= ground-2m=39.7m)', round4: 'Round-3 colored buildings EXCLUDING the hero buildings that are in port-bldg-hero-tex.glb (see hero-selection.json), so the two files combine without double geometry. Hero buildings not in the hero-tex GLB and within a landmark area receive the Astra D2 individual color overrides (exact colors, no hash modulation): viewo wall #EDEBE4 roof #5B7186; aquarium wall #D8D5CC roof #2E4A5A; fish-market wall #D5D9DB roof #6E7F8A. In this dataset every hero was textured, so no override is applied.', coloring: 'Astra round-3 palette (DESIGN-astra-round3.md) applied per building with roof/wall split by face normal (normal.y > 0.5 -> roof) and per-building HSL lightness x0.94..1.06 by FNV-1a hash of (tile,batchId). Usage classification was attempted via the batch-table gml_id -> CityGML gml:id join (verified 525/525 matched) but the Numazu 2021 CityGML bldg records contain NO usage attribute, so ALL buildings use the unknown class: wall #CFCEC8, roof #777C7C.', frame: 'local ENU, origin lat 35.0815 lon 138.8576 h 0 (WGS84); x=east, y=up, z=-north', note: 'COLOR_0 carries the per-building class color; material base color is white. Renderers must apply vertex colors (glTF COLOR_0 semantics; three.js GLTFLoader does this automatically, custom materials need vertexColors=true).' } },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'numazu-port-bldg-lod2-color-nohero' }],
  meshes: [{ name: 'bldg_lod2_color_nohero', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, indices: 3, material: 0, mode: 4 }] }],
  materials: [{ name: 'paper-white-vertexcolor', pbrMetallicRoughness: { baseColorFactor: [1.0, 1.0, 1.0, 1.0], metallicFactor: 0.0, roughnessFactor: 0.95 } }],
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
writeFileSync(new URL('./port-bldg-color-nohero.glb', import.meta.url), glb);
// gltfpack (-cc), same settings as the other packed deliverables
const noheroPlainPath = new URL('./port-bldg-color-nohero.glb', import.meta.url).pathname;
const noheroPackedPath = new URL('./port-bldg-color-nohero-packed.glb', import.meta.url).pathname;
execFileSync(new URL('./node_modules/.bin/gltfpack', import.meta.url).pathname, ['-i', noheroPlainPath, '-o', noheroPackedPath, '-cc'], { stdio: 'pipe' });
const noheroPackedBytes = statSync(noheroPackedPath).size;
const baseVals = [...buildingBase.values()].sort((a, b) => a - b);
const stats = {
  theme: 'bldg_lod2_color_nohero', tileCount: files.length, failed, rawB3dmBytes: rawBytes,
  round4: {
    excludedHeroBuildings: excludeKeys.size,
    excludedHeroTriangles: excludedHeroTris,
    overrideApplied: [...overrideColors.entries()].map(([key, v]) => ({ key, area: v.area, wall: v.hex.wall, roof: v.hex.roof })),
    overrideDefined: OVERRIDE_HEX,
  },
  distinctBuildings: emittedKeys.size,
  distinctBuildingsInSource: buildingKeys.size,
  usageJoin: {
    keySource: 'b3dm batch table gml_id -> CityGML bldg gml:id',
    idMatch: '525/525 buildings matched',
    usageAttributePresent: false,
    usageFinding: 'Numazu 2021 CityGML bldg records carry no usage attribute (tag census of meshes 52384698 + 52385608; BuildingDetailAttribute contains only surveyYear). Classification impossible -> all buildings colored as unknown class.',
    classCounts: { commercial: 0, residential: 0, warehouse: 0, public: 0, unknown: buildingKeys.size },
  },
  paletteUsed: { unknown: { wall: '#CFCEC8', roof: '#777C7C' } },
  roofTriangles: roofTris, wallTriangles: wallTris,
  frame: 'corrected: glTF Y-up up-axis conversion (lx,-lz,ly) applied before ECEF->ENU',
  groundLevelAssumed: GROUND, ceilingApplied: Y_MAX, floorApplied: Y_MIN,
  trianglesBefore: trisBefore, trianglesRemovedByCeilingFilter: trisRemoved, trianglesAfter: totTris,
  verticesBefore: vertsBefore, verticesAfter: totVerts, pointsClampedToFloor: clampedPoints,
  literalThresholdImpact: { trianglesWithAnyVertexAboveAbsolute60m: literalTrisAbove, pointsBelowAbsoluteMinus2m: literalPointsBelow },
  buildingBaseY: { min: baseVals[0], median: baseVals[Math.floor(baseVals.length / 2)], max: baseVals[baseVals.length - 1] },
  glbBytes: glb.length, packedGlbBytes: noheroPackedBytes, min, max,
};
writeFileSync(new URL('./convert-nohero-stats.json', import.meta.url), JSON.stringify(stats, null, 1));
console.log(`== lod2-color-nohero: tiles=${files.length} failed=${failed.length} tris ${trisBefore} -> ${totTris} (removed ${trisRemoved}, excludedHero ${excludedHeroTris}) verts ${vertsBefore} -> ${totVerts} clampedPts=${clampedPoints} buildings=${emittedKeys.size}/${buildingKeys.size} overrides=${overrideColors.size} roofTris=${roofTris} wallTris=${wallTris} glb=${glb.length} packed=${noheroPackedBytes}`);
console.log(`   building base y: min=${stats.buildingBaseY.min.toFixed(1)} median=${stats.buildingBaseY.median.toFixed(1)} max=${stats.buildingBaseY.max.toFixed(1)} | literal-60m tris=${literalTrisAbove}, literal-(-2m) pts=${literalPointsBelow}`);
console.log(`   ENU range after clean: x ${min[0].toFixed(1)}..${max[0].toFixed(1)}, y ${min[1].toFixed(1)}..${max[1].toFixed(1)}, z ${min[2].toFixed(1)}..${max[2].toFixed(1)}`);
console.log('done');
