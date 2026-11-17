"""Batch supplementary furniture photographs into one atlas per district.
Geometry UVs are Float32 in the uncompressed converter output. Requires Pillow.
"""
import io,json,struct,sys,math
from pathlib import Path
from PIL import Image
path=Path(sys.argv[1]); b=path.read_bytes(); n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);binary=bytearray(b[28+n:]); images=j.get('images',[])
if not images:sys.exit(0)
cols=min(8,len(images));rows=math.ceil(len(images)/cols);size=256;inner=252
atlas=Image.new('RGBA',(cols*size,rows*size),(160,160,150,255))
for i,image in enumerate(images):
 v=j['bufferViews'][image['bufferView']];o=v.get('byteOffset',0);im=Image.open(io.BytesIO(binary[o:o+v['byteLength']])).convert('RGBA').resize((inner,inner),Image.Resampling.LANCZOS)
 x=(i%cols)*size+2;y=(i//cols)*size+2;atlas.paste(im,(x,y))
 # Edge padding keeps mipmap samples from bleeding into neighboring photographs.
 atlas.paste(im.crop((0,0,1,inner)).resize((2,inner)),(x-2,y));atlas.paste(im.crop((inner-1,0,inner,inner)).resize((2,inner)),(x+inner,y))
 atlas.paste(im.crop((0,0,inner,1)).resize((inner,2)),(x,y-2));atlas.paste(im.crop((0,inner-1,inner,inner)).resize((inner,2)),(x,y+inner))
changed={}
for mesh in j['meshes']:
 for p in mesh['primitives']:
  m=j['materials'][p.get('material',0)];t=m.get('pbrMetallicRoughness',{}).get('baseColorTexture')
  if t is None:continue
  tex=j['textures'][t['index']];image=tex.get('extensions',{}).get('EXT_texture_webp',{}).get('source',tex.get('source'));a=p['attributes'].get('TEXCOORD_0')
  if a is None:raise ValueError('Photograph without UV')
  if a in changed:
   if changed[a]!=image:raise ValueError('Shared UV accessor across different source photos')
   continue
  changed[a]=image;acc=j['accessors'][a];v=j['bufferViews'][acc['bufferView']]
  if acc['componentType']!=5126 or acc['type']!='VEC2':raise ValueError('Expected uncompressed Float32 UVs')
  offset=v.get('byteOffset',0)+acc.get('byteOffset',0);stride=v.get('byteStride',8)
  for i in range(acc['count']):
   u,w=struct.unpack_from('<ff',binary,offset+i*stride);struct.pack_into('<ff',binary,offset+i*stride,((image%cols)*size+2+u*inner)/atlas.width,((image//cols)*size+2+w*inner)/atlas.height)
for m in j['materials']:
 p=m.get('pbrMetallicRoughness',{})
 if 'baseColorTexture' in p:p['baseColorTexture']['index']=0;p['roughnessFactor']=.85;p['metallicFactor']=0
out=io.BytesIO();atlas.save(out,format='WEBP',quality=88,method=6);data=out.getvalue();binary.extend(b'\0'*(-len(binary)%4));offset=len(binary);binary.extend(data);j['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)})
j['images']=[{'bufferView':len(j['bufferViews'])-1,'mimeType':'image/webp'}];j['textures']=[{'extensions':{'EXT_texture_webp':{'source':0}}}];binary.extend(b'\0'*(-len(binary)%4));j['buffers'][0]['byteLength']=len(binary)
encoded=json.dumps(j,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);length=28+len(encoded)+len(binary);path.write_bytes(struct.pack('<5I',0x46546c67,2,length,len(encoded),0x4e4f534a)+encoded+struct.pack('<2I',len(binary),0x004e4942)+binary)
print('Furniture atlas:',len(images),'photos',atlas.size)
