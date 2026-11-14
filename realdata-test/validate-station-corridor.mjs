// Structural checks for corridor coverage and texture retention; no rendering required.
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { parseGlb } from './inspect-b3dm.mjs';
const publicDir = new URL('../spike-3d/public/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('data/station-manifest.json', publicDir)));
const tiles = new Set(), ids = new Set();
let buildings = 0, photos = 0, bytes = 0;
for (const chunk of manifest.chunks) {
  assert(!ids.has(chunk.id), `duplicate chunk ${chunk.id}`); ids.add(chunk.id);
  for (const tile of chunk.tiles) { assert(!tiles.has(tile), `duplicate source tile ${tile}`); tiles.add(tile); }
  const path = new URL(chunk.url, publicDir);
  const { json, bin } = parseGlb(readFileSync(path));
  assert.equal(bin.length, json.buffers[0].byteLength);
  assert.equal(json.images?.length ?? 0, chunk.images);
  let triangles = 0;
  for (const mesh of json.meshes) for (const primitive of mesh.primitives) {
    triangles += json.accessors[primitive.indices ?? primitive.attributes.POSITION].count / 3;
    const texture = json.materials[primitive.material]?.pbrMetallicRoughness?.baseColorTexture;
    if (texture) {
      assert.notEqual(primitive.attributes.TEXCOORD_0, undefined, `missing photo UV in ${chunk.id}`);
      const image = json.textures[texture.index].extensions.EXT_texture_webp.source;
      assert(json.images[image], `missing photograph ${chunk.id}`);
    }
  }
  assert.equal(triangles, chunk.triangles);
  assert(chunk.min.every(Number.isFinite) && chunk.max.every(Number.isFinite));
  buildings += chunk.buildings; photos += chunk.withPhotos; bytes += statSync(path).size;
}
// Station south exit: ENU x about 210 m, z about -2395 m.
assert(manifest.chunks.some(c => c.min[0] < 210 && c.max[0] > 210 && c.min[2] < -2395 && c.max[2] > -2395));
assert.equal(ids.size, 28);
assert.equal(buildings, 7327);
for (const name of ['road','terrain','veg','water-sea','water-river']) {
  const {json,bin} = parseGlb(readFileSync(new URL(`data/corridor-${name}-packed.glb`,publicDir)));
  assert.equal(bin.length,json.buffers[0].byteLength);
}
console.log(JSON.stringify({chunks: ids.size, sourceTiles: tiles.size, buildings, withPhotos: photos, buildingBytes: bytes}));
