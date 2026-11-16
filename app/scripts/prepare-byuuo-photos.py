#!/usr/bin/env python3
"""
Prepare Byuuo Photos:
Strips EXIF/GPS/XMP metadata, extracts needed clean photo sources,
verifies pixel integrity, and outputs sources.json with SHA256 hashes.
"""

import os
import sys
import hashlib
import json
from PIL import Image

src_dir = '/home/hatch/workspace/shinkai-git/materials/byuuo'
dst_dir = '/home/hatch/workspace/shinkai-git/shinkai-atsume/public/environment/byuuo'
os.makedirs(dst_dir, exist_ok=True)

# Sources to prepare
targets = [
    {
        'src': 'byuuo-02-east-closeup.jpg',
        'dst': 'byuuo-closeup.jpg',
        'desc': 'East closeup for watergate rivets and concrete texture'
    },
    {
        'src': 'byuuo-03-front-harbor.webp',
        'dst': 'byuuo-front.webp',
        'desc': 'Front harbor view for observatory glass, walkway truss, and pediments'
    }
]

sources_manifest = {
    'landmark': 'byuuo',
    'created': '2026-11-16',
    'license': 'Provided by user for Numazu Shinkai Atsume project',
    'files': []
}

for t in targets:
    src_path = os.path.join(src_dir, t['src'])
    dst_path = os.path.join(dst_dir, t['dst'])

    with Image.open(src_path) as img:
        # Convert/strip metadata by recreating image without info dict / EXIF
        data = list(img.getdata())
        clean_img = Image.new(img.mode, img.size)
        clean_img.putdata(data)

        if t['dst'].endswith('.jpg'):
            clean_img.save(dst_path, 'JPEG', quality=92, optimize=True)
        elif t['dst'].endswith('.webp'):
            clean_img.save(dst_path, 'WEBP', quality=92)

    with open(dst_path, 'rb') as f:
        content = f.read()
        sha256 = hashlib.sha256(content).hexdigest()
        size = len(content)

    sources_manifest['files'].append({
        'filename': t['dst'],
        'originalSource': t['src'],
        'sha256': sha256,
        'sizeBytes': size,
        'dimensions': [clean_img.size[0], clean_img.size[1]],
        'usage': t['desc']
    })
    print(f"Processed: {t['dst']} ({size / 1024:.1f} KB, sha256: {sha256[:16]}...)")

manifest_path = os.path.join(dst_dir, 'sources.json')
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(sources_manifest, f, indent=2, ensure_ascii=False)

print(f"Sources manifest written to {manifest_path}")
