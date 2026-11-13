// Deep inspection of texture apparatus in b3dm-embedded glTF (Part A step 1).
// Usage: node inspect-textures.mjs <b3dm> [<b3dm> ...]
import { readFileSync } from 'node:fs';
import { parseB3dm, parseGlb } from './inspect-b3dm.mjs';

for (const f of process.argv.slice(2)) {
  const buf = readFileSync(f);
  const { ftJson, gltf } = parseB3dm(buf);
  const { json, bin } = parseGlb(gltf);
  console.log('=====', f, `(${buf.length} B)`);
  console.log('featureTable keys:', Object.keys(ftJson).join(','), 'BATCH_LENGTH=', ftJson.BATCH_LENGTH);
  console.log('extensions root:', JSON.stringify(json.extensions || null));
  console.log('extensionsUsed:', JSON.stringify(json.extensionsUsed || null));
  console.log('images:', (json.images || []).length);
  (json.images || []).forEach((img, i) => {
    const bv = json.bufferViews[img.bufferView];
    console.log(`  image[${i}] mime=${img.mimeType} bufferView=${img.bufferView} bytes=${bv?.byteLength} name=${img.name || ''}`);
  });
  console.log('textures:', (json.textures || []).length, JSON.stringify(json.textures || []));
  console.log('samplers:', JSON.stringify(json.samplers || []));
  console.log('materials:', (json.materials || []).length);
  (json.materials || []).forEach((m, i) => console.log(`  mat[${i}]`, JSON.stringify(m)));
  let primCount = 0, withUV = 0, withDraco = 0, modes = new Set();
  const attrSets = new Map();
  for (const mesh of json.meshes || []) for (const prim of mesh.primitives) {
    primCount++;
    modes.add(prim.mode ?? 4);
    const key = Object.keys(prim.attributes).sort().join('+');
    attrSets.set(key, (attrSets.get(key) || 0) + 1);
    if (prim.attributes.TEXCOORD_0 !== undefined) withUV++;
    const dr = prim.extensions?.KHR_draco_mesh_compression;
    if (dr) { withDraco++; }
    if (primCount <= 2) console.log('  prim sample:', JSON.stringify(prim).slice(0, 500));
  }
  console.log(`primitives: ${primCount}, with TEXCOORD_0: ${withUV}, draco: ${withDraco}, modes: ${[...modes].join(',')}`);
  console.log('attribute sets:', [...attrSets.entries()].map(([k, v]) => `${k} x${v}`).join(' | '));
  console.log('BIN chunk bytes:', bin.length);
}
