// Texture-PRESERVING rebuild of Numazu Port bldg tiles (LOD2 or LOD3) from
// the local b3dm tiles in /tmp/plateau-scratch/tiles/<subdir>:
//  - b3dm -> embedded GLB -> Draco decode (POSITION, NORMAL, TEXCOORD_0, COLOR_0)
//  - CORRECTED FRAME (see RESULT.md section 8.1): glTF Y-up up-axis conversion
//    (lx, -lz, ly) applied to local coords (normals too) before ECEF->ENU.
//    ENU origin lat 35.0815, lon 138.8576, h=0; x=east, y=up, z=-north.
//    Ground level in this frame is y ~= +41.7 m.
//  - Textures preserved: each source tile carries exactly 1 WebP image,
//    referenced via EXT_texture_webp; images are copied byte-for-byte into the
//    merged BIN and re-referenced. Materials are deduplicated after remapping
//    texture indices (the untextured "default_material" collapses to one).
//  - Geometry is kept indexed (as decoded); no welding, no simplification.
// Usage: node convert-bldg-tex.mjs <scratchSubdir> <outFile> <statsFile> <label>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parseB3dm, parseGlb } from './plateau-glb.mjs';

const require = createRequire(import.meta.url);
const draco3d = require(process.env.DRACO3D_MODULE || 'draco3d');

const [, , subdir, outFile, statsFile, label] = process.argv;
const excludedIds = new Set((process.env.EXCLUDE_GML_IDS || '').split(',').filter(Boolean));
const excludedTriangles = new Map();

// ---------- WGS84 ECEF -> ENU (same as other converters) ----------
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

// ---------- 4x4 helpers (same as clean converter) ----------
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

// ---------- decode one primitive -> raw local arrays ----------
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
    const ncomp = attr.num_components();
    const arr = new Draco.DracoFloat32Array();
    decoder.GetAttributeFloatForAllPoints(mesh, attr, arr);
    const out = new Float32Array(arr.size());
    for (let i = 0; i < arr.size(); i++) out[i] = arr.GetValue(i);
    Draco.destroy(arr);
    return { values: out, ncomp, count: mesh.num_points() };
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

// ---------- merged output assembly ----------
const binChunks = []; const views = []; const accessors = [];
let binLen = 0, geometryBytes = 0, textureBytes = 0;
function pushBuffer(bytes, target) {
  let b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pad = (4 - (binLen % 4)) % 4;
  if (pad) { binChunks.push(Buffer.alloc(pad)); binLen += pad; }
  const off = binLen;
  binChunks.push(b); binLen += b.length;
  const v = { buffer: 0, byteOffset: off, byteLength: b.length };
  if (target !== undefined) v.target = target;
  views.push(v);
  return views.length - 1;
}
function pushAccessor(arr, type, compType, target) {
  const bvIdx = pushBuffer(arr.data, target);
  const acc = { bufferView: bvIdx, componentType: compType, count: arr.count, type };
  accessors.push(acc);
  return accessors.length - 1;
}

const dir = `/tmp/plateau-scratch/tiles/${subdir}`;
const files = readdirSync(dir).filter(f => f.endsWith('.b3dm')).sort();
const outImages = [];        // {bufferView, mimeType}
const outSamplers = [];      // deduped
const samplerMap = new Map();
const outTextures = [];      // {sampler, extensions:{EXT_texture_webp:{source}}}
const outMaterials = [];     // deduped after remap
const materialMap = new Map();
const outMeshes = []; const outNodes = [];
let rawBytes = 0, totTris = 0, totVerts = 0, primsTotal = 0;
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
const failed = [];
const imageFormats = new Map();
const buildingCoverage = new Map();
const nightLightBounds = new Map();

for (const f of files) {
  const buf = readFileSync(`${dir}/${f}`);
  rawBytes += buf.length;
  try {
    const { gltf } = parseB3dm(buf);
    const batchStart = 28 + buf.readUInt32LE(12) + buf.readUInt32LE(16);
    const batchLength = buf.readUInt32LE(20);
    const batchTable = batchLength ? JSON.parse(buf.toString('utf8', batchStart, batchStart + batchLength).replace(/\0+$/, '').trim()) : {};
    const { json, bin } = parseGlb(gltf);
    const center = json.extensions?.CESIUM_RTC?.center;
    if (!center) throw new Error('no CESIUM_RTC center');

    // images -> global
    const imgRemap = new Map();
    (json.images || []).forEach((img, i) => {
      const bv = json.bufferViews[img.bufferView];
      const bytes = Buffer.from(bin.buffer, bin.byteOffset + (bv.byteOffset || 0), bv.byteLength);
      const bvIdx = pushBuffer(bytes, undefined);
      textureBytes += bv.byteLength;
      imageFormats.set(img.mimeType, (imageFormats.get(img.mimeType) || 0) + 1);
      imgRemap.set(i, outImages.length);
      outImages.push({ bufferView: bvIdx, mimeType: img.mimeType, name: `${f}#${i}` });
    });
    // sampler -> global (dedupe by JSON)
    const sampRemap = new Map();
    (json.samplers || []).forEach((s, i) => {
      const key = JSON.stringify(s);
      if (!samplerMap.has(key)) { samplerMap.set(key, outSamplers.length); outSamplers.push(s); }
      sampRemap.set(i, samplerMap.get(key));
    });
    // textures -> global
    const texRemap = new Map();
    (json.textures || []).forEach((t, i) => {
      const src = t.extensions?.EXT_texture_webp?.source ?? t.source;
      if (src === undefined || !imgRemap.has(src)) throw new Error(`texture ${i}: no resolvable image source`);
      const nt = { extensions: { EXT_texture_webp: { source: imgRemap.get(src) } } };
      if (t.sampler !== undefined) nt.sampler = sampRemap.get(t.sampler) ?? 0;
      texRemap.set(i, outTextures.length);
      outTextures.push(nt);
    });
    // materials -> global (dedupe after remap)
    const matRemap = new Map();
    (json.materials || []).forEach((m, i) => {
      const nm = JSON.parse(JSON.stringify(m));
      const texInfo = nm.pbrMetallicRoughness?.baseColorTexture;
      if (texInfo) texInfo.index = texRemap.get(texInfo.index);
      const key = JSON.stringify(nm);
      if (!materialMap.has(key)) { materialMap.set(key, outMaterials.length); outMaterials.push(nm); }
      matRemap.set(i, materialMap.get(key));
    });

    // geometry: one output mesh per tile
    const outPrims = [];
    for (const inst of collectMeshInstances(json)) {
      const mesh = json.meshes[inst.meshIndex];
      for (const prim of mesh.primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const dec = decodePrimitive(json, bin, prim);
        if (excludedIds.size) {
          if (!dec._BATCHID || !Array.isArray(batchTable.gml_id)) throw Error('Cannot filter buildings without source batch IDs');
          const kept = [];
          for (let i = 0; i < dec.indices.length; i += 3) {
            const face = Array.from(dec.indices.slice(i, i + 3));
            const ids = face.map(index => batchTable.gml_id[Math.round(dec._BATCHID.values[index])]);
            if (ids.some(id => excludedIds.has(id))) {
              if (!ids.every(id => id === ids[0])) throw Error('Triangle crosses source building IDs');
              excludedTriangles.set(ids[0], (excludedTriangles.get(ids[0]) || 0) + 1);
            } else kept.push(...face);
          }
          dec.indices = Uint32Array.from(kept);
          if (!dec.indices.length) continue;
        }
        const sourceMaterial = json.materials?.[prim.material];
        const hasPhoto = !!sourceMaterial?.pbrMetallicRoughness?.baseColorTexture;
        for (const index of dec.indices) {
          const batchId = dec._BATCHID ? Math.round(dec._BATCHID.values[index]) : 0;
          const key = `${f}:${batchId}`;
          const record = buildingCoverage.get(key) ?? { key, hasPhoto: false };
          record.hasPhoto ||= hasPhoto;
          buildingCoverage.set(key, record);
        }
        const n = dec.POSITION.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
        const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          applyMat(inst.world, dec.POSITION.values, i * 3, tmp);
          const ox = tmp[0], oy = -tmp[2], oz = tmp[1];
          ecefToEnu(center[0] + ox - P0[0], center[1] + oy - P0[1], center[2] + oz - P0[2], pos, i * 3);
          if(process.env.EXTRACT_NIGHT_LIGHTS){
            const bid=dec._BATCHID?Math.round(dec._BATCHID.values[i]):0;
            const attr=batchTable.attributes?.[bid],id=attr?.['gml:id'];
            if(id&&attr['frn:function']==='照明施設'){
              const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];let b=nightLightBounds.get(id);
              if(!b){b={id,x:0,z:0,count:0,y:-Infinity,minY:y};nightLightBounds.set(id,b);}
              b.minY=Math.min(b.minY,y);
              if(y>b.y+.2){b.x=x;b.z=z;b.count=1;b.y=y;}
              else if(y>=b.y-.2){b.x+=x;b.z+=z;b.count++;b.y=Math.max(b.y,y);}
            }
          }

          for (let k = 0; k < 3; k++) { const v = pos[i * 3 + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
          if (dec.NORMAL) {
            const w = Float64Array.from(inst.world); w[12] = 0; w[13] = 0; w[14] = 0;
            applyMat(w, dec.NORMAL.values, i * 3, tmp2);
            const len = Math.hypot(tmp2[0], tmp2[1], tmp2[2]) || 1;
            rotateNormal(tmp2[0] / len, -tmp2[2] / len, tmp2[1] / len, nor, i * 3);
          } else nor.set([0, 1, 0], i * 3);
        }
        const attrs = {};
        const posAcc = { data: pos, count: n };
        const pIdx = pushAccessor(posAcc, 'VEC3', 5126, 34962);
        accessors[pIdx].min = [Infinity, Infinity, Infinity]; accessors[pIdx].max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) {
          const v = pos[i * 3 + k];
          if (v < accessors[pIdx].min[k]) accessors[pIdx].min[k] = v;
          if (v > accessors[pIdx].max[k]) accessors[pIdx].max[k] = v;
        }
        geometryBytes += pos.byteLength;
        attrs.POSITION = pIdx;
        attrs.NORMAL = pushAccessor({ data: nor, count: n }, 'VEC3', 5126, 34962); geometryBytes += nor.byteLength;
        if (dec.TEXCOORD_0) {
          attrs.TEXCOORD_0 = pushAccessor({ data: dec.TEXCOORD_0.values, count: n }, 'VEC2', 5126, 34962);
          geometryBytes += dec.TEXCOORD_0.values.byteLength;
        }
        if (dec.COLOR_0) {
          const t = dec.COLOR_0.ncomp === 4 ? 'VEC4' : 'VEC3';
          attrs.COLOR_0 = pushAccessor({ data: dec.COLOR_0.values, count: n }, t, 5126, 34962);
          geometryBytes += dec.COLOR_0.values.byteLength;
        }
        const iIdx = pushAccessor({ data: dec.indices, count: dec.indices.length }, 'SCALAR', 5125, 34963);
        geometryBytes += dec.indices.byteLength;
        const op = { attributes: attrs, indices: iIdx, mode: 4 };
        if (prim.material !== undefined) op.material = matRemap.get(prim.material);
        outPrims.push(op);
        primsTotal++;
        totTris += dec.indices.length / 3;
        totVerts += n;
      }
    }
    if (outPrims.length) {
      outMeshes.push({ name: `bldg_${label}_${f.replace('.b3dm', '')}`, primitives: outPrims });
      outNodes.push({ mesh: outMeshes.length - 1, name: f.replace('.b3dm', '') });
    }
    console.log(`${label} ${f}: ok (${outPrims.length} prims)`);
  } catch (e) {
    failed.push({ file: f, error: String(e.message || e) });
    console.log(`${label} ${f}: FAILED ${e.message || e}`);
  }
}

if (excludedIds.size && (failed.length || [...excludedIds].some(id => !excludedTriangles.has(id)))) throw Error('Source ID filtering failed or requested building not found');
const binBuf = Buffer.concat(binChunks);
const gltfJson = {
  asset: { version: '2.0', generator: `plateau-b3dm-to-glb texture-preserving (${label})`, extras: { source: `PLATEAU 3D Tiles Numazu City ${label.startsWith('2023-') ? '2023' : '2021'}, frn ${label}, textures preserved (WebP via EXT_texture_webp)`, frame: 'local ENU, origin lat 35.0815 lon 138.8576 h 0 (WGS84); x=east, y=up, z=-north; ground level y~=41.7m', geometryBytes, textureBytes } },
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
const glb = Buffer.concat([head, jh, jsonBuf, Buffer.alloc(jsonPad, 0x20), bh, binBuf]);
writeFileSync(outFile, glb);
const stats = {
  nightLights:[...nightLightBounds.values()].filter(b=>b.count).map(b=>({id:b.id,x:b.x/b.count,y:b.y,z:b.z/b.count})),
  excludedTriangles: Object.fromEntries(excludedTriangles),
  buildingCoverage: {
    total: buildingCoverage.size,
    withPhotos: [...buildingCoverage.values()].filter(b => b.hasPhoto).length,
    withoutPhotos: [...buildingCoverage.values()].filter(b => !b.hasPhoto).map(b => b.key),
  },
  theme: `bldg_${label}_textured`, tileCount: files.length, failed, rawB3dmBytes: rawBytes,
  triangles: totTris, vertices: totVerts, primitives: primsTotal,
  images: outImages.length, imageFormats: Object.fromEntries(imageFormats),
  textures: outTextures.length, materials: outMaterials.length,
  geometryBytes, textureBytes, glbBytes: glb.length, min, max,
};
writeFileSync(statsFile, JSON.stringify(stats, null, 1));
console.log(`== ${label}-tex: tiles=${files.length} failed=${failed.length} tris=${totTris} verts=${totVerts} images=${outImages.length} geomBytes=${geometryBytes} texBytes=${textureBytes} glb=${glb.length}`);
console.log(`   ENU range: x ${min[0].toFixed(1)}..${max[0].toFixed(1)}, y ${min[1].toFixed(1)}..${max[1].toFixed(1)}, z ${min[2].toFixed(1)}..${max[2].toFixed(1)}`);
