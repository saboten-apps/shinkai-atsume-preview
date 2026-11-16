#!/usr/bin/env python3
"""
Restore original WebP textures into meshopt-compressed GLB.
When Three.js GLTFExporter exports a scene, it converts WebP textures into raw/PNG images.
This utility swaps those expanded images back to the original WebP images from the source GLB,
preserving visual quality while keeping file size tiny (e.g. 1.6 MB instead of 22 MB).
"""

import sys
import struct
import json
import os

def read_glb(path):
    with open(path, 'rb') as f:
        magic, ver, length = struct.unpack('<4sII', f.read(12))
        chunk_len, chunk_type = struct.unpack('<II', f.read(8))
        json_bytes = f.read(chunk_len)
        data = json.loads(json_bytes.decode('utf-8'))
        pad = (4 - (chunk_len % 4)) % 4
        f.seek(12 + 8 + chunk_len + pad)
        bin_len, bin_type = struct.unpack('<II', f.read(8))
        bin_data = f.read(bin_len)
        return data, bin_data

def restore_webp(orig_path, packed_path, out_path):
    d_orig, b_orig = read_glb(orig_path)
    d_packed, b_packed = read_glb(packed_path)

    orig_images = d_orig.get('images', [])
    # Check if original has WebP images
    has_webp = any(img.get('mimeType') == 'image/webp' or 'EXT_texture_webp' in d_orig.get('extensionsUsed', []) for img in orig_images)
    if not has_webp or len(orig_images) == 0:
        # Original doesn't use WebP, just copy packed to out
        if packed_path != out_path:
            with open(packed_path, 'rb') as src, open(out_path, 'wb') as dst:
                dst.write(src.read())
        return

    # Extract orig webp image bytes
    webp_bytes = []
    for i, img in enumerate(orig_images):
        bv = d_orig['bufferViews'][img['bufferView']]
        offset = bv.get('byteOffset', 0)
        length = bv['byteLength']
        webp_bytes.append(b_orig[offset:offset+length])

    num_images = len(orig_images)
    # In packed GLB, geometry bufferViews follow image bufferViews
    first_geom_bv_idx = num_images
    if first_geom_bv_idx >= len(d_packed['bufferViews']):
        # No geometry bufferViews? Just return
        return

    first_geom_bv = d_packed['bufferViews'][first_geom_bv_idx]
    if 'extensions' in first_geom_bv and 'EXT_meshopt_compression' in first_geom_bv['extensions']:
        geom_start_offset = first_geom_bv['extensions']['EXT_meshopt_compression']['byteOffset']
    else:
        geom_start_offset = first_geom_bv.get('byteOffset', 0)

    geom_data = b_packed[geom_start_offset:]

    # Build new bin_data
    new_bin = bytearray()
    new_bvs = []
    offset = 0

    for i in range(num_images):
        w = webp_bytes[i]
        pad = (4 - (len(w) % 4)) % 4
        w_padded = w + b'\x00' * pad
        new_bvs.append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(w)})
        new_bin.extend(w_padded)
        offset += len(w_padded)

    new_geom_start_offset = offset
    offset_shift = new_geom_start_offset - geom_start_offset

    # Append geometry data
    new_bin.extend(geom_data)

    # Update packed json
    d_new = json.loads(json.dumps(d_packed))
    if 'EXT_texture_webp' not in d_new.get('extensionsUsed', []):
        d_new.setdefault('extensionsUsed', []).append('EXT_texture_webp')

    for i in range(num_images):
        d_new['bufferViews'][i] = new_bvs[i]
        d_new['images'][i] = {
            'bufferView': i,
            'mimeType': 'image/webp',
            'name': orig_images[i].get('name')
        }
        if i < len(d_new.get('textures', [])):
            d_new['textures'][i] = {
                'sampler': d_packed['textures'][i].get('sampler', 0),
                'extensions': {
                    'EXT_texture_webp': {'source': i}
                }
            }

    # Update geometry bufferViews in buffer 0
    for i in range(num_images, len(d_new['bufferViews'])):
        bv = d_new['bufferViews'][i]
        if 'extensions' in bv and 'EXT_meshopt_compression' in bv['extensions']:
            ext = bv['extensions']['EXT_meshopt_compression']
            ext['byteOffset'] += offset_shift
        elif bv.get('buffer') == 0:
            bv['byteOffset'] = bv.get('byteOffset', 0) + offset_shift

    d_new['buffers'][0]['byteLength'] = len(new_bin)

    new_json_bytes = json.dumps(d_new, separators=(',', ':')).encode('utf-8')
    pad_json = (4 - (len(new_json_bytes) % 4)) % 4
    new_json_bytes += b' ' * pad_json

    total_len = 12 + 8 + len(new_json_bytes) + 8 + len(new_bin)
    header = struct.pack('<4sII', b'glTF', 2, total_len)
    json_chunk = struct.pack('<II', len(new_json_bytes), 0x4E4F534A) + new_json_bytes
    bin_chunk = struct.pack('<II', len(new_bin), 0x004E4942) + bytes(new_bin)

    with open(out_path, 'wb') as f:
        f.write(header)
        f.write(json_chunk)
        f.write(bin_chunk)

    print(f"✓ Restored WebP textures: {out_path} ({total_len/1e6:.2f} MB)")

if __name__ == '__main__':
    if len(sys.argv) < 4:
        print("Usage: restore-webp-textures.py <orig.glb> <packed.glb> <out.glb>")
        sys.exit(1)
    restore_webp(sys.argv[1], sys.argv[2], sys.argv[3])
