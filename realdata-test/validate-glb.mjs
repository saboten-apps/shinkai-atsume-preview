// Structural validation of a GLB: counts, texture apparatus, triangle total,
// extensions used, and whether the JSON + BIN are self-consistent.
import { readFileSync } from 'node:fs';
import { parseGlb } from './inspect-b3dm.mjs';

for (const f of process.argv.slice(2)) {
  const buf = readFileSync(f);
  try {
    const { json, bin } = parseGlb(buf);
    let tris = 0, prims = 0, texPrims = 0;
    for (const mesh of json.meshes || []) for (const p of mesh.primitives) {
      prims++;
      const idxAcc = p.indices !== undefined ? json.accessors[p.indices] : null;
      const posAcc = json.accessors[p.attributes.POSITION];
      tris += (idxAcc ? idxAcc.count : posAcc.count) / 3;
      const m = json.materials?.[p.material];
      if (m?.pbrMetallicRoughness?.baseColorTexture) texPrims++;
    }
    let imgBytes = 0;
    for (const img of json.images || []) if (img.bufferView !== undefined) imgBytes += json.bufferViews[img.bufferView].byteLength;
    console.log(`${f}: ${buf.length} B | meshes=${(json.meshes || []).length} prims=${prims} tris=${Math.round(tris)} images=${(json.images || []).length} (imgBytes=${imgBytes}) textures=${(json.textures || []).length} materials=${(json.materials || []).length} texturedPrims=${texPrims} extensionsUsed=${JSON.stringify(json.extensionsUsed || [])} binActual=${bin.length} binDeclared=${json.buffers?.[0]?.byteLength}`);
  } catch (e) {
    console.log(`${f}: PARSE FAILED ${e.message}`);
  }
}
