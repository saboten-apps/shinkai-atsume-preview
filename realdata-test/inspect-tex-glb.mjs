// Inspect port-bldg-tex.glb: primitive structure, which carry textures, and
// the source COLOR_0 value distribution (warm-tint check for round 4).
import { readFileSync } from 'node:fs';
import { parseGlb } from './inspect-b3dm.mjs';

const buf = readFileSync(new URL('./port-bldg-tex.glb', import.meta.url));
const { json, bin } = parseGlb(buf);
console.log(`meshes=${json.meshes.length} materials=${json.materials.length} images=${json.images?.length} textures=${json.textures?.length}`);
json.materials.forEach((m, i) => console.log(` material[${i}] ${m.name || ''} baseColorTexture=${m.pbrMetallicRoughness?.baseColorTexture ? JSON.stringify(m.pbrMetallicRoughness.baseColorTexture) : 'none'} baseColorFactor=${JSON.stringify(m.pbrMetallicRoughness?.baseColorFactor)}`));

function readAcc(idx) {
  const acc = json.accessors[idx];
  const bv = json.bufferViews[acc.bufferView];
  const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const TA = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[acc.componentType];
  const ncomp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[acc.type];
  const out = new TA(acc.count * ncomp);
  const stride = bv.byteStride && bv.byteStride !== ncomp * (TA.BYTES_PER_ELEMENT) ? bv.byteStride : ncomp * TA.BYTES_PER_ELEMENT;
  for (let i = 0; i < acc.count; i++) out.set(new TA(bin.buffer, bin.byteOffset + off + i * stride, ncomp), i * ncomp);
  return out;
}

let primTex = 0, primCol = 0, primBoth = 0, colSamples = [];
for (const mesh of json.meshes) {
  for (const p of mesh.primitives) {
    const hasTex = p.attributes.TEXCOORD_0 !== undefined;
    const hasCol = p.attributes.COLOR_0 !== undefined;
    const mat = json.materials[p.material];
    const matTex = !!mat?.pbrMetallicRoughness?.baseColorTexture;
    if (hasTex) primTex++;
    if (hasCol) primCol++;
    if (hasTex && hasCol) primBoth++;
    if (hasCol && colSamples.length < 4000) {
      const c = readAcc(p.attributes.COLOR_0);
      const ncomp = json.accessors[p.attributes.COLOR_0].type === 'VEC4' ? 4 : 3;
      for (let i = 0; i < c.length && colSamples.length < 4000; i += ncomp) colSamples.push([c[i], c[i + 1], c[i + 2]]);
    }
    if (hasTex !== matTex) console.log(` NOTE: prim texcoord=${hasTex} but material texture=${matTex} (mesh ${mesh.name})`);
  }
}
console.log(`primitives with TEXCOORD_0: ${primTex}, with COLOR_0: ${primCol}, with both: ${primBoth}`);
if (colSamples.length) {
  const mean = [0, 1, 2].map(k => colSamples.reduce((s, c) => s + c[k], 0) / colSamples.length);
  const distinct = new Set(colSamples.map(c => c.map(v => v.toFixed(3)).join(',')));
  console.log(`COLOR_0 sample n=${colSamples.length} mean rgb=(${mean.map(v => v.toFixed(3)).join(', ')}) distinct(first4000)=${[...distinct].slice(0, 12).join(' | ')}`);
}
