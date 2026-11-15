#!/usr/bin/env python3
"""Restore available source detail, never upscale a lower-resolution atlas."""
import argparse,hashlib,io,json,pathlib,struct
from PIL import Image
parser=argparse.ArgumentParser();parser.add_argument('--source-tiles',default='/tmp/plateau-scratch/source-bldg_lod2');args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1];out=root/'public/environment/building-details';out.mkdir(parents=True,exist_ok=True)
def glb(raw):
 n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
low={}
for path in (root/'public/map/data').glob('*packed.glb'):
 j,binary=glb(path.read_bytes())
 for image in j.get('images',[]):
  name=image.get('name');view=j['bufferViews'][image['bufferView']];block=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
  if name:low[name]=Image.open(io.BytesIO(block)).size
entries=[]
for path in sorted(pathlib.Path(args.source_tiles).glob('*.b3dm')):
 raw=path.read_bytes();header=struct.unpack_from('<7I',raw);j,binary=glb(raw[28+sum(header[3:7]):])
 for index,image in enumerate(j.get('images',[])):
  name=f'{path.name}#{index}'
  if name not in low:continue
  view=j['bufferViews'][image['bufferView']];block=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]
  photo=Image.open(io.BytesIO(block));original=photo.size
  if max(original)<=max(low[name]):continue
  photo.thumbnail((2048,2048),Image.Resampling.LANCZOS)
  if max(photo.size)<=max(low[name]):continue
  filename=f'{path.stem}-{index}.webp';buffer=io.BytesIO();photo.save(buffer,format='WEBP',quality=90,method=6);data=buffer.getvalue();(out/filename).write_bytes(data)
  entries.append({'sourceName':name,'url':f'environment/building-details/{filename}','width':photo.width,'height':photo.height,'baseSize':list(low[name]),'sourceSize':list(original),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
manifest={'source':'PLATEAU Numazu City 2021 original photographic atlases, resized only when larger than 2048px','maxTextureSize':2048,'maxResidentTextures':3,'entries':entries}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'availableDetailAtlases':len(entries),'totalBytes':sum(e['bytes'] for e in entries),'largestBytes':max((e['bytes'] for e in entries),default=0)}))
