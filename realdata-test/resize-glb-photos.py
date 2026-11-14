"""Limit embedded WebP atlas resolution before gltfpack. Requires Pillow."""
import io, json, struct, sys
from pathlib import Path
from PIL import Image
path = Path(sys.argv[1])
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 1024
raw = path.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
model = json.loads(raw[20:20+size])
source = raw[28+size:]
image_views = {image['bufferView'] for image in model.get('images', [])}
binary = bytearray()
for index, view in enumerate(model['bufferViews']):
    offset = view.get('byteOffset', 0)
    block = source[offset:offset+view['byteLength']]
    if index in image_views:
        image = Image.open(io.BytesIO(block))
        if max(image.size) > limit:
            image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
            output = io.BytesIO()
            image.save(output, format='WEBP', quality=85, method=6)
            block = output.getvalue()
    binary.extend(b'\0' * (-len(binary) % 4))
    view['byteOffset'], view['byteLength'] = len(binary), len(block)
    binary.extend(block)
binary.extend(b'\0' * (-len(binary) % 4))
model['buffers'][0]['byteLength'] = len(binary)
encoded = json.dumps(model, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
length = 28 + len(encoded) + len(binary)
path.write_bytes(struct.pack('<5I', 0x46546c67, 2, length, len(encoded), 0x4e4f534a) + encoded + struct.pack('<2I', len(binary), 0x004e4942) + binary)
