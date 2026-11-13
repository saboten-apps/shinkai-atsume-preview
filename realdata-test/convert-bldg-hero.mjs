// Round-4 hero-texture extraction (Astra design D3/T2, selective):
//  - Decode all 43 LOD2 b3dm tiles (corrected ENU frame, same as round 3),
//    tracking per-building (_BATCHID) centroid / footprint / textured tris.
//  - Hero selection: buildings whose centroid is within 60 m of a landmark
//    (びゅうお / 深海水族館 / 魚市場) PLUS the 10 largest-footprint buildings
//    in the port bbox, deduplicated.
//  - Textured heroes (buildings with >= 1 triangle in a textured primitive)
//    are extracted with textures preserved and repacked into ONE GLB
//    (port-bldg-hero-tex.glb). Textured primitives carry NO COLOR_0 in the
//    source (verified: 0 primitives have both), so photos are never tinted;
//    the untextured faces of hero buildings keep the source COLOR_0, which
//    is a flat neutral gray (0.8,0.8,0.8) — not the warm #EEE8DC tint of
//    the generated color pipeline.
//  - Budget: if the gltfpack(-cc) output exceeds 2,200,000 B, drop textured
//    heroes farthest from the landmarks first (non-landmark-area heroes
//    before within-60 m ones) and rebuild, until within budget or nothing
//    droppable remains. Dropped heroes are reported so the companion
//    color-nohero build can include them.
//  - Writes hero-selection.json (consumed by convert-bldg-color-nohero.mjs)
//    and convert-hero-stats.json.
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseB3dm, parseGlb } from './inspect-b3dm.mjs';

const require = createRequire(import.meta.url);
const draco3d = require('draco3d');

// ---------- ENU frame (identical to round-3 converters) ----------
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
  for (let i = 0; i < acc.count; i++) out.set(new TA(bin.buffer, bin.byteOffset + off + i * stride, ncomp), i * ncomp);
  return { data: out, ncomp, count: acc.count };
}

// ---------- decode (POSITION/NORMAL/TEXCOORD_0/COLOR_0/_BATCHID) ----------
const Draco = await draco3d.createDecoderModule({});
function decodePrimitive(json, bin, prim) {
  const ext = prim.extensions?.KHR_draco_mesh_compression;
  if (!ext) {
    const res = {};
    for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0', '_BATCHID']) {
      if (prim.attributes[name] !== undefined) {
        const r = readAccessor(json, bin, prim.attributes[name]);
        res[name] = { values: Float32Array.from(r.data), ncomp: r.ncomp, count: r.count };
      }
    }
    let idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices).data : null;
    if (!idx) { idx = new Uint32Array(res.POSITION.count); for (let i = 0; i < idx.length; i++) idx[i] = i; }
    res.indices = Uint32Array.from(idx);
    return res;
  }
  const bv = json.bufferViews[ext.bufferView];
  const bytes = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const decoder = new Draco.Decoder();
  const buffer = new Draco.DecoderBuffer();
  buffer.Init(new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), bytes.byteLength);
  if (decoder.GetEncodedGeometryType(buffer) !== Draco.TRIANGULAR_MESH) throw new Error('draco: not a mesh');
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
    const out = new Float32Array(arr.size());
    for (let i = 0; i < arr.size(); i++) out[i] = arr.GetValue(i);
    Draco.destroy(arr);
    return { values: out, ncomp: attr.num_components(), count: mesh.num_points() };
  };
  const res = {};
  for (const name of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0', '_BATCHID']) {
    const a = getAttr(name);
    if (a) res[name] = a;
  }
  const nFaces = mesh.num_faces();
  const indices = new Uint32Array(nFaces * 3);
  const face = new Draco.DracoInt32Array();
  for (let i = 0; i < nFaces; i++) { decoder.GetFaceFromMesh(mesh, i, face); indices[i * 3] = face.GetValue(0); indices[i * 3 + 1] = face.GetValue(1); indices[i * 3 + 2] = face.GetValue(2); }
  Draco.destroy(face); Draco.destroy(mesh); Draco.destroy(buffer); Draco.destroy(decoder);
  res.indices = indices;
  return res;
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

// ---------- Phase 1: decode all tiles, per-building stats ----------
const Y_MAX = 41.7 + 60; // same ceiling filter as round 3 (drops nothing in practice)
const dir = '/tmp/plateau-scratch/tiles/lod2';
const files = readdirSync(dir).filter(f => f.endsWith('.b3dm')).sort();
const tiles = []; // decoded tile structures kept in memory for Phase 3
const buildings = new Map(); // key -> stats
let mixedTriKeys = 0;

for (const f of files) {
  const buf = readFileSync(`${dir}/${f}`);
  const { gltf } = parseB3dm(buf);
  const { json, bin } = parseGlb(gltf);
  const center = json.extensions?.CESIUM_RTC?.center;
  if (!center) throw new Error(`${f}: no CESIUM_RTC center`);
  const tile = { file: f, json, bin, prims: [] };
  for (const inst of collectMeshInstances(json)) {
    const mesh = json.meshes[inst.meshIndex];
    for (const prim of mesh.primitives) {
      if ((prim.mode ?? 4) !== 4) continue;
      const dec = decodePrimitive(json, bin, prim);
      const mat = prim.material !== undefined ? json.materials[prim.material] : null;
      const textured = !!mat?.pbrMetallicRoughness?.baseColorTexture;
      const n = dec.POSITION.count;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        applyMat(inst.world, dec.POSITION.values, i * 3, tmp);
        const ox = tmp[0], oy = -tmp[2], oz = tmp[1];
        ecefToEnu(center[0] + ox - P0[0], center[1] + oy - P0[1], center[2] + oz - P0[2], pos, i * 3);
        if (dec.NORMAL) {
          const w = Float64Array.from(inst.world); w[12] = 0; w[13] = 0; w[14] = 0;
          applyMat(w, dec.NORMAL.values, i * 3, tmp2);
          const len = Math.hypot(tmp2[0], tmp2[1], tmp2[2]) || 1;
          rotateNormal(tmp2[0] / len, -tmp2[2] / len, tmp2[1] / len, nor, i * 3);
        } else nor.set([0, 1, 0], i * 3);
      }
      const bids = dec._BATCHID ? dec._BATCHID.values : null;
      const keyOf = (vi) => `${f}:${bids ? Math.round(bids[vi]) : 0}`;
      tile.prims.push({
        textured, materialIndex: prim.material,
        pos, nor,
        tex: dec.TEXCOORD_0 ? dec.TEXCOORD_0.values : null,
        col: dec.COLOR_0 ? { values: dec.COLOR_0.values, ncomp: dec.COLOR_0.ncomp } : null,
        bids, indices: dec.indices, vertCount: n,
      });
      // per-building accumulation
      for (let i = 0; i < n; i++) {
        const key = keyOf(i);
        let b = buildings.get(key);
        if (!b) { b = { key, tile: f, batchId: bids ? Math.round(bids[i]) : 0, sumX: 0, sumZ: 0, verts: 0, bottomArea: 0, roofArea: 0, texTris: 0, plainTris: 0 }; buildings.set(key, b); }
        b.sumX += pos[i * 3]; b.sumZ += pos[i * 3 + 2]; b.verts++;
      }
      for (let t = 0; t < dec.indices.length; t += 3) {
        const ia = dec.indices[t], ib = dec.indices[t + 1], ic = dec.indices[t + 2];
        const ka = keyOf(ia);
        if (keyOf(ib) !== ka || keyOf(ic) !== ka) mixedTriKeys++;
        const b = buildings.get(ka);
        if (pos[ia * 3 + 1] > Y_MAX || pos[ib * 3 + 1] > Y_MAX || pos[ic * 3 + 1] > Y_MAX) continue; // ceiling filter (0 in practice)
        if (textured) b.texTris++; else b.plainTris++;
        // XZ-projected area split by geometric face orientation
        const ax = pos[ia * 3], ay = pos[ia * 3 + 1], az = pos[ia * 3 + 2];
        const bx = pos[ib * 3], by = pos[ib * 3 + 1], bz = pos[ib * 3 + 2];
        const cx = pos[ic * 3], cy = pos[ic * 3 + 1], cz = pos[ic * 3 + 2];
        const ux = bx - ax, uy = by - ay, uz = bz - az;
        const vx = cx - ax, vy = cy - ay, vz = cz - az;
        const cyy = uz * vx - ux * vz; // cross product y component
        const xzArea = Math.abs(cyy) / 2;
        const clen = Math.hypot(uy * vz - uz * vy, cyy, ux * vy - uy * vx) || 1;
        const ny = cyy / clen;
        if (ny < -0.5) b.bottomArea += xzArea;
        else if (ny > 0.5) b.roofArea += xzArea;
      }
    }
  }
  tiles.push(tile);
  console.log(`hero-analysis ${f}: ok`);
}
for (const b of buildings.values()) {
  b.centroid = [b.sumX / b.verts, b.sumZ / b.verts];
  b.footprint = b.bottomArea > 0 ? b.bottomArea : b.roofArea;
  b.footprintSource = b.bottomArea > 0 ? 'bottom-faces' : 'roof-projection';
}
console.log(`buildings=${buildings.size} mixedKeyTris=${mixedTriKeys}`);

// ---------- Phase 2: hero selection ----------
const LANDMARKS = [
  { name: 'びゅうお', x: -210, z: -366 },
  { name: '深海水族館', x: -73, z: -300 },
  { name: '魚市場', x: -36, z: -233 },
];
for (const b of buildings.values()) {
  let best = null;
  for (const lm of LANDMARKS) {
    const d = Math.hypot(b.centroid[0] - lm.x, b.centroid[1] - lm.z);
    if (!best || d < best.dist) best = { name: lm.name, dist: d };
  }
  b.nearestLandmark = best.name;
  b.landmarkDist = best.dist;
}
const byFootprint = [...buildings.values()].sort((a, b2) => b2.footprint - a.footprint);
byFootprint.forEach((b, i) => { b.footprintRank = i + 1; });
const heroes = new Map();
for (const b of buildings.values()) if (b.landmarkDist <= 60) heroes.set(b.key, { b, reasons: [`landmark:${b.nearestLandmark}`] });
for (const b of byFootprint.slice(0, 10)) {
  const h = heroes.get(b.key);
  if (h) h.reasons.push(`largest-footprint#${b.footprintRank}`);
  else heroes.set(b.key, { b, reasons: [`largest-footprint#${b.footprintRank}`] });
}
for (const h of heroes.values()) h.textured = h.b.texTris > 0;
console.log(`heroes=${heroes.size} textured=${[...heroes.values()].filter(h => h.textured).length}`);

// ---------- Phase 3: hero-tex build with budget loop ----------
const BUDGET = 2200000;
const GLTFPACK = new URL('./node_modules/.bin/gltfpack', import.meta.url).pathname;

function buildHeroTexGlb(keptKeys) {
  const binChunks = []; const views = []; const accessors = [];
  let binLen = 0, geometryBytes = 0, textureBytes = 0;
  const pushBuffer = (bytes, target) => {
    const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const pad = (4 - (binLen % 4)) % 4;
    if (pad) { binChunks.push(Buffer.alloc(pad)); binLen += pad; }
    const off = binLen;
    binChunks.push(b); binLen += b.length;
    const v = { buffer: 0, byteOffset: off, byteLength: b.length };
    if (target !== undefined) v.target = target;
    views.push(v);
    return views.length - 1;
  };
  const pushAccessor = (arr, type, compType, target) => {
    const bvIdx = pushBuffer(arr.data, target);
    const acc = { bufferView: bvIdx, componentType: compType, count: arr.count, type };
    accessors.push(acc);
    return accessors.length - 1;
  };
  const outImages = [], outSamplers = [], outTextures = [], outMaterials = [], outMeshes = [], outNodes = [];
  const samplerMap = new Map(), materialMap = new Map();
  let totTris = 0, totVerts = 0;

  for (const tile of tiles) {
    // does this tile contribute any kept triangle?
    const contributes = tile.prims.some(p => {
      for (let t = 0; t < p.indices.length; t += 3) {
        const vi = p.indices[t];
        if (keptKeys.has(`${tile.file}:${p.bids ? Math.round(p.bids[vi]) : 0}`)) return true;
      }
      return false;
    });
    if (!contributes) continue;
    const { json, bin } = tile;
    const imgRemap = new Map();
    (json.images || []).forEach((img, i) => {
      const bv = json.bufferViews[img.bufferView];
      const bytes = Buffer.from(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
      const bvIdx = pushBuffer(bytes, undefined);
      textureBytes += bv.byteLength;
      imgRemap.set(i, outImages.length);
      outImages.push({ bufferView: bvIdx, mimeType: img.mimeType, name: `${tile.file}#${i}` });
    });
    const sampRemap = new Map();
    (json.samplers || []).forEach((s, i) => {
      const key = JSON.stringify(s);
      if (!samplerMap.has(key)) { samplerMap.set(key, outSamplers.length); outSamplers.push(s); }
      sampRemap.set(i, samplerMap.get(key));
    });
    const texRemap = new Map();
    (json.textures || []).forEach((t, i) => {
      const src = t.extensions?.EXT_texture_webp?.source ?? t.source;
      if (src === undefined || !imgRemap.has(src)) throw new Error(`${tile.file} texture ${i}: no resolvable image`);
      const nt = { extensions: { EXT_texture_webp: { source: imgRemap.get(src) } } };
      if (t.sampler !== undefined) nt.sampler = sampRemap.get(t.sampler) ?? 0;
      texRemap.set(i, outTextures.length);
      outTextures.push(nt);
    });
    const matRemap = new Map();
    (json.materials || []).forEach((m, i) => {
      const nm = JSON.parse(JSON.stringify(m));
      const texInfo = nm.pbrMetallicRoughness?.baseColorTexture;
      if (texInfo) texInfo.index = texRemap.get(texInfo.index);
      const key = JSON.stringify(nm);
      if (!materialMap.has(key)) { materialMap.set(key, outMaterials.length); outMaterials.push(nm); }
      matRemap.set(i, materialMap.get(key));
    });
    const outPrims = [];
    for (const p of tile.prims) {
      // filter triangles to kept buildings (+ ceiling filter)
      const keptTris = [];
      for (let t = 0; t < p.indices.length; t += 3) {
        const ia = p.indices[t], ib = p.indices[t + 1], ic = p.indices[t + 2];
        const key = `${tile.file}:${p.bids ? Math.round(p.bids[ia]) : 0}`;
        if (!keptKeys.has(key)) continue;
        if (p.pos[ia * 3 + 1] > Y_MAX || p.pos[ib * 3 + 1] > Y_MAX || p.pos[ic * 3 + 1] > Y_MAX) continue;
        keptTris.push(ia, ib, ic);
      }
      if (!keptTris.length) continue;
      // vertex compaction
      const remap = new Map();
      const used = [];
      for (const vi of keptTris) if (!remap.has(vi)) { remap.set(vi, used.length); used.push(vi); }
      const n = used.length;
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
      const tex = p.tex ? new Float32Array(n * 2) : null;
      const col = p.col ? new Float32Array(n * p.col.ncomp) : null;
      used.forEach((src, dst) => {
        pos.set(p.pos.subarray(src * 3, src * 3 + 3), dst * 3);
        nor.set(p.nor.subarray(src * 3, src * 3 + 3), dst * 3);
        if (tex) tex.set(p.tex.subarray(src * 2, src * 2 + 2), dst * 2);
        if (col) col.set(p.col.values.subarray(src * p.col.ncomp, src * p.col.ncomp + p.col.ncomp), dst * p.col.ncomp);
      });
      const idx = new Uint32Array(keptTris.map(vi => remap.get(vi)));
      const attrs = {};
      const pIdx = pushAccessor({ data: pos, count: n }, 'VEC3', 5126, 34962);
      const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
      accessors[pIdx].min = mn; accessors[pIdx].max = mx;
      geometryBytes += pos.byteLength;
      attrs.POSITION = pIdx;
      attrs.NORMAL = pushAccessor({ data: nor, count: n }, 'VEC3', 5126, 34962); geometryBytes += nor.byteLength;
      if (tex) { attrs.TEXCOORD_0 = pushAccessor({ data: tex, count: n }, 'VEC2', 5126, 34962); geometryBytes += tex.byteLength; }
      if (col) { attrs.COLOR_0 = pushAccessor({ data: col, count: n }, p.col.ncomp === 4 ? 'VEC4' : 'VEC3', 5126, 34962); geometryBytes += col.byteLength; }
      const iIdx = pushAccessor({ data: idx, count: idx.length }, 'SCALAR', 5125, 34963);
      geometryBytes += idx.byteLength;
      const op = { attributes: attrs, indices: iIdx, mode: 4 };
      if (p.materialIndex !== undefined && p.materialIndex !== null) op.material = matRemap.get(p.materialIndex);
      outPrims.push(op);
      totTris += idx.length / 3; totVerts += n;
    }
    if (outPrims.length) {
      outMeshes.push({ name: `hero_${tile.file.replace('.b3dm', '')}`, primitives: outPrims });
      outNodes.push({ mesh: outMeshes.length - 1, name: tile.file.replace('.b3dm', '') });
    }
  }
  const binBuf = Buffer.concat(binChunks);
  const gltfJson = {
    asset: { version: '2.0', generator: 'plateau-b3dm-to-glb hero-texture extraction (round 4)', extras: { source: 'PLATEAU 3D Tiles Numazu City 2021, bldg LOD2 — hero buildings only (landmark 60 m + 10 largest footprints), textures preserved (WebP via EXT_texture_webp)', frame: 'local ENU, origin lat 35.0815 lon 138.8576 h 0 (WGS84); x=east, y=up, z=-north; ground level y~=41.7m', geometryBytes, textureBytes, tintNote: 'Textured primitives carry no COLOR_0 in the source (verified), so photo textures are not vertex-tinted. Untextured faces of hero buildings keep the source COLOR_0, a flat neutral gray (0.8,0.8,0.8).' } },
    extensionsUsed: ['EXT_texture_webp'],
    scene: 0, scenes: [{ nodes: outNodes.map((_, i) => i) }],
    nodes: outNodes, meshes: outMeshes, materials: outMaterials,
    textures: outTextures, samplers: outSamplers, images: outImages,
    accessors, bufferViews: views, buffers: [{ byteLength: binBuf.length }],
  };
  const jsonStr = JSON.stringify(gltfJson);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  const total = 12 + 8 + jsonBuf.length + jsonPad + 8 + binBuf.length;
  const head = Buffer.alloc(12); head.write('glTF', 0, 'ascii'); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length + jsonPad, 0); jh.write('JSON', 4, 'ascii');
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length, 0); bh.write('BIN\0', 4, 'ascii');
  return { glb: Buffer.concat([head, jh, jsonBuf, Buffer.alloc(jsonPad, 0x20), bh, binBuf]), tris: totTris, verts: totVerts, images: outImages.length, textureBytes, geometryBytes };
}

const keptKeys = new Set([...heroes.values()].filter(h => h.textured).map(h => h.b.key));
const dropped = [];
let attempt = 0, lastBuild = null, packedBytes = Infinity;
while (true) {
  attempt++;
  lastBuild = buildHeroTexGlb(keptKeys);
  const tmpIn = new URL('./.hero-tex-tmp.glb', import.meta.url).pathname;
  const tmpOut = new URL('./.hero-tex-tmp-packed.glb', import.meta.url).pathname;
  writeFileSync(tmpIn, lastBuild.glb);
  execFileSync(GLTFPACK, ['-i', tmpIn, '-o', tmpOut, '-cc'], { stdio: 'pipe' });
  packedBytes = statSync(tmpOut).size;
  console.log(`budget attempt ${attempt}: kept=${keptKeys.size} plain=${lastBuild.glb.length}B packed=${packedBytes}B tris=${lastBuild.tris} images=${lastBuild.images}`);
  if (packedBytes <= BUDGET) { unlinkSync(tmpIn); break; }
  // drop candidates: farthest from landmarks first; within-60 m heroes last
  const cands = [...keptKeys].map(k => heroes.get(k).b)
    .sort((a, b2) => {
      const aIn = a.landmarkDist <= 60 ? 0 : 1, bIn = b2.landmarkDist <= 60 ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn; // not-in-area (1) sorted ... we want non-area dropped first: handle below
      return b2.landmarkDist - a.landmarkDist;
    });
  // reorder: non-area candidates first (desc dist), then in-area (desc dist)
  const nonArea = cands.filter(b => b.landmarkDist > 60).sort((a, b2) => b2.landmarkDist - a.landmarkDist);
  const inArea = cands.filter(b => b.landmarkDist <= 60).sort((a, b2) => b2.landmarkDist - a.landmarkDist);
  const victim = [...nonArea, ...inArea][0];
  if (!victim) { console.log('budget: nothing left to drop'); unlinkSync(tmpIn); break; }
  keptKeys.delete(victim.key);
  dropped.push(victim.key);
  unlinkSync(tmpIn);
}
// finalize files
const plainPath = new URL('./port-bldg-hero-tex.glb', import.meta.url).pathname;
const packedPath = new URL('./port-bldg-hero-tex-packed.glb', import.meta.url).pathname;
writeFileSync(plainPath, lastBuild.glb);
execFileSync(GLTFPACK, ['-i', plainPath, '-o', packedPath, '-cc'], { stdio: 'pipe' });
const packedFinal = statSync(packedPath).size;
try { unlinkSync(new URL('./.hero-tex-tmp-packed.glb', import.meta.url).pathname); } catch {}

// ---------- selection record ----------
const heroList = [...heroes.values()].map(h => {
  const status = !h.textured ? 'textureless' : (keptKeys.has(h.b.key) ? 'hero-tex' : 'dropped-budget');
  return {
    key: h.b.key, tile: h.b.tile, batchId: h.b.batchId,
    centroid: h.b.centroid.map(v => +v.toFixed(1)),
    footprintM2: +h.b.footprint.toFixed(1), footprintRank: h.b.footprintRank, footprintSource: h.b.footprintSource,
    nearestLandmark: h.b.nearestLandmark, landmarkDistM: +h.b.landmarkDist.toFixed(1),
    withinLandmarkArea: h.b.landmarkDist <= 60,
    selectionReasons: h.reasons,
    textured: h.textured, texTris: h.b.texTris, plainTris: h.b.plainTris,
    status,
  };
}).sort((a, b2) => a.landmarkDistM - b2.landmarkDistM);
const selection = {
  round: 4, landmarks: LANDMARKS, radiusM: 60, budgetBytes: BUDGET,
  heroTexKeptKeys: [...keptKeys], droppedForBudget: dropped,
  heroes: heroList,
};
writeFileSync(new URL('./hero-selection.json', import.meta.url), JSON.stringify(selection, null, 1));
const stats = {
  theme: 'bldg_lod2_hero_tex', buildingsTotal: buildings.size, heroesTotal: heroList.length,
  heroesTextured: heroList.filter(h => h.textured).length,
  heroesTextureless: heroList.filter(h => !h.textured).length,
  heroesKeptInTexGlb: keptKeys.size, droppedForBudget: dropped,
  heroTexGlb: { bytes: lastBuild.glb.length, tris: lastBuild.tris, verts: lastBuild.verts, images: lastBuild.images, textureBytes: lastBuild.textureBytes, geometryBytes: lastBuild.geometryBytes },
  heroTexPackedGlb: { bytes: packedFinal },
  budgetBytes: BUDGET, withinBudget: packedFinal <= BUDGET,
  mixedKeyTriangles: mixedTriKeys,
};
writeFileSync(new URL('./convert-hero-stats.json', import.meta.url), JSON.stringify(stats, null, 1));
console.log('== hero selection:');
for (const h of heroList) console.log(`  ${h.key} fp=${h.footprintM2}m2(rank ${h.footprintRank}) near=${h.nearestLandmark} ${h.landmarkDistM}m reasons=${h.selectionReasons.join('+')} textured=${h.textured} status=${h.status}`);
console.log(`== hero-tex: plain=${lastBuild.glb.length}B packed=${packedFinal}B tris=${lastBuild.tris} withinBudget=${packedFinal <= BUDGET}`);
