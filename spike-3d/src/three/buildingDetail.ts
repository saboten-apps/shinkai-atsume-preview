import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type ByteRange = { byteOffset?: number; byteLength: number; buffer: number };
type TextureTransform = { offset?: [number, number]; scale?: [number, number]; rotation?: number };
type MaterialSource = {
  pbrMetallicRoughness?: {
    baseColorTexture?: { index: number; extensions?: { KHR_texture_transform?: TextureTransform } };
  };
};
type PackedModel = {
  buffers: ByteRange[];
  bufferViews: (ByteRange & { extensions?: { EXT_meshopt_compression?: ByteRange } })[];
  extensionsUsed: string[];
  extensionsRequired: string[];
  materials: MaterialSource[];
  textures?: { extensions: { EXT_texture_webp: { source: number } } }[];
  images?: { bufferView: number; mimeType: string }[];
  samplers?: unknown[];
};

export async function loadBuildingDetail(url: string, loader: GLTFLoader, signal: AbortSignal) {
  let fullFile: Uint8Array | undefined;
  async function read(start: number, end: number): Promise<Uint8Array> {
    if (fullFile) return fullFile.slice(start, end + 1);
    const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, signal });
    if (!response.ok) throw new Error(`Building asset HTTP ${response.status}`);
    const data = new Uint8Array(await response.arrayBuffer());
    if (response.status === 200) {
      fullFile = data;
      return data.slice(start, end + 1);
    }
    if (data.length !== end - start + 1 ||
        !response.headers.get('Content-Range')?.startsWith(`bytes ${start}-${end}/`)) {
      throw new Error('Unexpected building asset range');
    }
    return data;
  }

  const header = await read(0, 19);
  const view = new DataView(header.buffer, header.byteOffset);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('Invalid building GLB');
  const jsonSize = view.getUint32(12, true);
  const model = JSON.parse(new TextDecoder().decode(await read(20, 19 + jsonSize))) as PackedModel;
  const dataStart = 28 + jsonSize;
  const photos = model.materials.map(material => {
    const reference = material.pbrMetallicRoughness?.baseColorTexture;
    const texture = reference && model.textures?.[reference.index];
    const image = texture && model.images?.[texture.extensions.EXT_texture_webp.source];
    if (!image || !reference) return null;
    const range = model.bufferViews[image.bufferView];
    return { start: dataStart + (range.byteOffset ?? 0), length: range.byteLength,
      mimeType: image.mimeType, transform: reference.extensions?.KHR_texture_transform };
  });

  // The packed GLB stores images first, then meshopt data in one contiguous range.
  const imageViews = new Set(model.images?.map(image => image.bufferView));
  const compressed = model.bufferViews.flatMap(bufferView => {
    const block = bufferView.extensions?.EXT_meshopt_compression;
    return block ? [block] : [];
  });
  if (!compressed.length || model.bufferViews.some((v, i) => v.buffer === 0 && !imageViews.has(i))) {
    throw new Error('Unexpected packed building layout');
  }
  const geometryStart = Math.min(...compressed.map(block => block.byteOffset ?? 0));
  const geometryEnd = Math.max(...compressed.map(block => (block.byteOffset ?? 0) + block.byteLength));
  const geometryBytes = await read(dataStart + geometryStart, dataStart + geometryEnd - 1);
  for (const block of compressed) block.byteOffset = (block.byteOffset ?? 0) - geometryStart;
  // Keep the view indices used by accessors, but exclude all photo bytes.
  model.bufferViews = model.bufferViews.map((v, i) => imageViews.has(i)
    ? { buffer: 0, byteOffset: 0, byteLength: 1 }
    : v);
  for (const material of model.materials) delete material.pbrMetallicRoughness?.baseColorTexture;
  delete model.images;
  delete model.textures;
  delete model.samplers;
  const geometryExtensions = (name: string) => name !== 'EXT_texture_webp' && name !== 'KHR_texture_transform';
  model.extensionsUsed = model.extensionsUsed.filter(geometryExtensions);
  model.extensionsRequired = model.extensionsRequired.filter(geometryExtensions);
  const binLength = Math.ceil(geometryBytes.length / 4) * 4;
  model.buffers[0].byteLength = geometryBytes.length;
  const finalJson = new TextEncoder().encode(JSON.stringify(model));
  const finalJsonLength = Math.ceil(finalJson.length / 4) * 4;
  const glb = new ArrayBuffer(28 + finalJsonLength + binLength);
  const output = new DataView(glb);
  [0x46546c67, 2, glb.byteLength, finalJsonLength, 0x4e4f534a].forEach((value, i) => output.setUint32(i * 4, value, true));
  new Uint8Array(glb, 20, finalJsonLength).fill(32);
  new Uint8Array(glb, 20, finalJson.length).set(finalJson);
  output.setUint32(20 + finalJsonLength, binLength, true);
  output.setUint32(24 + finalJsonLength, 0x004e4942, true);
  new Uint8Array(glb, 28 + finalJsonLength, geometryBytes.length).set(geometryBytes);
  const gltf = await loader.parseAsync(glb, '');
  const group = gltf.scene;
  group.updateWorldMatrix(true, true);
  const sections: { material: THREE.MeshStandardMaterial; bounds: THREE.Box3; photo: NonNullable<(typeof photos)[number]>; retryAt: number }[] = [];
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
    const source = gltf.parser.associations.get(object.material)?.materials ?? -1;
    const photo = photos[source];
    object.material.roughness = .85;
    object.material.metalness = .05;
    if (photo) {
      object.material.color.set(0xd0c6b8);
      sections.push({ material: object.material, bounds: new THREE.Box3().setFromObject(object), photo, retryAt: 0 });
    }
  });

  let loading = false;
  let nextUpdate = 0;
  const distance = (section: (typeof sections)[number], position: THREE.Vector3) => section.bounds.distanceToPoint(position);
  function update(position: THREE.Vector3) {
    const now = performance.now();
    if (signal.aborted || now < nextUpdate) return;
    nextUpdate = now + 150;
    for (const section of sections) {
      if (!section.material.map || (position.y < 142 && distance(section, position) < 175)) continue;
      const texture = section.material.map;
      section.material.map = null;
      section.material.color.set(0xd0c6b8);
      section.material.needsUpdate = true;
      texture.dispose();
      (texture.image as ImageBitmap).close();
    }
    if (loading || position.y > 116) return;
    const section = sections.filter(s => !s.material.map && now >= s.retryAt && distance(s, position) < 115)
      .sort((a, b) => distance(a, position) - distance(b, position))[0];
    if (!section) return;
    loading = true;
    section.retryAt = now + 8000;
    const { start, length, mimeType, transform } = section.photo;
    void (async () => {
      const bytes = await read(start, start + length - 1);
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: mimeType }));
      if (signal.aborted || position.y > 142 || distance(section, position) >= 175) {
        bitmap.close();
        return;
      }
      const texture = new THREE.Texture(bitmap);
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      if (transform?.offset) texture.offset.fromArray(transform.offset);
      if (transform?.scale) texture.repeat.fromArray(transform.scale);
      if (transform?.rotation) texture.rotation = transform.rotation;
      texture.needsUpdate = true;
      section.material.map = texture;
      section.material.color.set(0xffffff);
      section.material.needsUpdate = true;
    })().catch(error => {
      if (!signal.aborted) console.warn('Building photo could not be loaded:', error);
    }).finally(() => { loading = false; });
  }

  return {
    group,
    update,
    dispose() {
      for (const { material } of sections) {
        const texture = material.map;
        if (!texture) continue;
        texture.dispose();
        (texture.image as ImageBitmap).close();
        material.map = null;
      }
    },
  };
}
