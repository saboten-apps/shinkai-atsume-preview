// Convert the extracted Numazu Port veg (roads) b3dm tiles into ONE
// merged, local-frame binary glTF (.glb). Same pipeline as buildings:
//  - b3dm -> embedded GLB -> KHR_draco_mesh_compression decode (draco3d)
//  - vertices: ECEF = CESIUM_RTC.center + remap(position); then ECEF -> ENU at
//    origin lat 35.0815, lon 138.8576, h=0 (WGS84).
//  - FRAME FIX (found 2026-11-12): b3dm local coords are glTF Y-up and need
//    the standard up-axis conversion before they can be used as ECEF offsets:
//    offset = (lx, -lz, ly)  [normals likewise: (nx, -nz, ny)].
//    Verified empirically: with this mapping, building bases in tile data1760
//    cluster at up = 41.4..41.9 (std 0.12, exactly 2 height levels per box)
//    and road tile data163 is flat (base 41.7..41.9, max relief 0.4 m);
//    the naive mapping (lx, ly, lz) smears heights by tens of meters.
//    Port ground level in this ENU frame is therefore y ~= +41.7 m
//    (ellipsoidal height; geoid ~38 m + TP elevation ~3 m).
//  - Output axes (Y-up): x = east, y = up, z = -north
//  - Single flat material (source COLOR_0/textures dropped, geometry test).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseB3dm, parseGlb } from './inspect-b3dm.mjs';

const require = createRequire(import.meta.url);
const draco3d = require('draco3d');

// ---------- WGS84 ECEF -> ENU ----------
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
  out[o]     = -sL * dx + cL * dy;                    // east -> x
  out[o + 1] = cP * cL * dx + cP * sL * dy + sP * dz; // up -> y
  out[o + 2] = sP * cL * dx + sP * sL * dy - cP * dz; // -north -> z
}
function rotateNormal(nx, ny, nz, out, o) {
  out[o]     = -sL * nx + cL * ny;
  out[o + 1] = cP * cL * nx + cP * sL * ny + sP * nz;
  out[o + 2] = sP * cL * nx + sP * sL * ny - cP * nz;
}

// ---------- minimal 4x4 helpers (column-major, glTF order) ----------
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

// ---------- non-draco accessor fallback ----------
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

// ---------- main ----------
const Draco = await draco3d.createDecoderModule({});

function decodePrimitive(json, bin, prim) {
  const ext = prim.extensions?.KHR_draco_mesh_compression;
  if (!ext) {
    const pos = readAccessor(json, bin, prim.attributes.POSITION);
    const nor = prim.attributes.NORMAL !== undefined ? readAccessor(json, bin, prim.attributes.NORMAL) : null;
    let idx = prim.indices !== undefined ? readAccessor(json, bin, prim.indices) : null;
    if (!idx) { idx = new Uint32Array(pos.length / 3); for (let i = 0; i < idx.length; i++) idx[i] = i; }
    return { positions: Float32Array.from(pos), normals: nor ? Float32Array.from(nor) : null, indices: Uint32Array.from(idx) };
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
  const nFaces = mesh.num_faces();
  const indices = new Uint32Array(nFaces * 3);
  const face = new Draco.DracoInt32Array();
  for (let i = 0; i < nFaces; i++) {
    decoder.GetFaceFromMesh(mesh, i, face);
    indices[i * 3] = face.GetValue(0); indices[i * 3 + 1] = face.GetValue(1); indices[i * 3 + 2] = face.GetValue(2);
  }
  Draco.destroy(face); Draco.destroy(mesh); Draco.destroy(buffer); Draco.destroy(decoder);
  return { positions, normals, indices };
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

const dir = '/tmp/plateau-scratch/tiles/veg';
const files = readdirSync(dir).filter(f => f.endsWith('.b3dm')).sort();
const posChunks = [], norChunks = [], idxChunks = [];
let vOff = 0, totVerts = 0, totTris = 0, rawBytes = 0;
const failed = [];
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
        const { positions, normals, indices } = decodePrimitive(json, bin, prim);
        const n = positions.length / 3;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
        const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          applyMat(inst.world, positions, i * 3, tmp);
          // glTF Y-up -> ECEF-offset up-axis conversion: (x, y, z) -> (x, -z, y)
          const ox = tmp[0], oy = -tmp[2], oz = tmp[1];
          const ex = center[0] + ox - P0[0], ey = center[1] + oy - P0[1], ez = center[2] + oz - P0[2];
          ecefToEnu(ex, ey, ez, pos, i * 3);
          if (normals) {
            const w = inst.world, keep = [w[12], w[13], w[14]];
            w[12] = 0; w[13] = 0; w[14] = 0;
            applyMat(w, normals, i * 3, tmp2);
            w[12] = keep[0]; w[13] = keep[1]; w[14] = keep[2];
            const len = Math.hypot(tmp2[0], tmp2[1], tmp2[2]) || 1;
            const nx = tmp2[0] / len, ny = -tmp2[2] / len, nz = tmp2[1] / len;
            rotateNormal(nx, ny, nz, nor, i * 3);
          } else { nor.set([0, 1, 0], i * 3); }
        }
        const idx = new Uint32Array(indices.length);
        for (let i = 0; i < indices.length; i++) idx[i] = indices[i] + vOff;
        posChunks.push(pos); norChunks.push(nor); idxChunks.push(idx);
        vOff += n; totVerts += n; totTris += indices.length / 3;
      }
    }
    console.log(`veg ${f}: ok`);
  } catch (e) {
    failed.push({ file: f, error: String(e.message || e) });
    console.log(`veg ${f}: FAILED ${e.message || e}`);
  }
}
// merge
const positions = new Float32Array(totVerts * 3), normals = new Float32Array(totVerts * 3);
const indices = new Uint32Array(totTris * 3);
let po = 0, io = 0;
posChunks.forEach((c, i) => { positions.set(c, po); normals.set(norChunks[i], po); po += c.length; });
idxChunks.forEach(c => { indices.set(c, io); io += c.length; });
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
push(indices, 'SCALAR', 5125, totTris * 3);
const binBuf = Buffer.concat(binChunks);
const gltfJson = {
  asset: { version: '2.0', generator: 'plateau-b3dm-to-glb (shinkai-atsume realdata-test)', extras: { source: 'PLATEAU 3D Tiles Numazu City 2021, veg (G-Spatial Center CKAN plateau-22203-numazu-shi-2021)', frame: 'local ENU, origin lat 35.0815 lon 138.8576 h 0 (WGS84); x=east, y=up, z=-north; b3dm glTF Y-up axis conversion (lx,-lz,ly) applied; ground level in frame y~=41.7m' } },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'numazu-port-veg' }],
  meshes: [{ name: 'veg', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0, mode: 4 }] }],
  materials: [{ name: 'veg-flat', pbrMetallicRoughness: { baseColorFactor: [0.23, 0.40, 0.20, 1.0], metallicFactor: 0.0, roughnessFactor: 0.95 } }],
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
writeFileSync(new URL('./port-veg.glb', import.meta.url), glb);
console.log(`== veg (roads): tiles=${files.length} failed=${failed.length} verts=${totVerts} tris=${totTris} rawB3dm=${rawBytes} glb=${glb.length}`);
console.log(`   ENU range: x ${min[0].toFixed(1)}..${max[0].toFixed(1)}, y ${min[1].toFixed(1)}..${max[1].toFixed(1)}, z ${min[2].toFixed(1)}..${max[2].toFixed(1)}`);
writeFileSync(new URL('./convert-veg-stats.json', import.meta.url),
  JSON.stringify({ theme: 'veg', tileCount: files.length, failed, vertices: totVerts, triangles: totTris, rawB3dmBytes: rawBytes, glbBytes: glb.length, min, max }, null, 1));
console.log('done');
