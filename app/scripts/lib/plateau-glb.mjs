// Dump the embedded glTF JSON of a b3dm for structure inspection.
import { readFileSync } from 'node:fs';

export function parseB3dm(buf) {
  if (buf.toString('ascii', 0, 4) !== 'b3dm') throw new Error('not b3dm');
  const ftJsonLen = buf.readUInt32LE(12);
  const ftBinLen = buf.readUInt32LE(16);
  const btJsonLen = buf.readUInt32LE(20);
  const btBinLen = buf.readUInt32LE(24);
  const ftJson = ftJsonLen ? JSON.parse(buf.toString('utf8', 28, 28 + ftJsonLen).replace(/\0+$/, '').trim() || '{}') : {};
  const gltfStart = 28 + ftJsonLen + ftBinLen + btJsonLen + btBinLen;
  return { ftJson, gltf: buf.subarray(gltfStart) };
}

export function parseGlb(buf) {
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error('embedded glTF is not GLB');
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const binStart = 20 + jsonLen;
  const binLen = buf.readUInt32LE(binStart);
  const bin = buf.subarray(binStart + 8, binStart + 8 + binLen);
  return { json, bin };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of process.argv.slice(2)) {
    const { ftJson, gltf } = parseB3dm(readFileSync(f));
    const { json } = parseGlb(gltf);
    console.log('====', f);
    console.log('featureTable:', JSON.stringify(ftJson));
    console.log('extensions:', JSON.stringify(json.extensions));
    console.log('nodes:', JSON.stringify(json.nodes));
    console.log('meshes:', JSON.stringify(json.meshes).slice(0, 600));
    console.log('accessors[0..3]:', JSON.stringify((json.accessors || []).slice(0, 4)));
    console.log('bufferViews:', JSON.stringify(json.bufferViews).slice(0, 300));
    console.log('materials:', JSON.stringify(json.materials || []).slice(0, 300));
    console.log('images:', (json.images || []).length, 'textures:', (json.textures || []).length);
  }
}
