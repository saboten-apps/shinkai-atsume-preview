"""Copy photographic JPEG scan data unchanged; strip EXIF/GPS/XMP metadata.
No image synthesis, resampling, retouching or reconstructed facade pixels.
"""
from pathlib import Path
import hashlib,json,sys
source=Path(sys.argv[1]);dest=Path(__file__).resolve().parents[1]/'public/environment/city-hall'
dest.mkdir(parents=True,exist_ok=True)
files={'facade.jpg':'PXL_20261115_061134220.jpg','entrance.jpg':'PXL_20261115_061212021.jpg','concrete.jpg':'PXL_20261115_061245300.jpg'}
def strip_metadata(data):
 assert data[:2]==b'\xff\xd8'
 out=bytearray(data[:2]);i=2
 while i<len(data):
  assert data[i]==255
  marker=data[i+1]
  if marker in (0xda,0xd9):out.extend(data[i:]);break
  length=int.from_bytes(data[i+2:i+4],'big');end=i+2+length
  is_icc=marker==0xe2 and data[i+4:end].startswith(b'ICC_PROFILE\x00')
  if is_icc or not (0xe1<=marker<=0xef or marker==0xfe):out.extend(data[i:end])
  i=end
 return bytes(out)
manifest=[]
for name,original in files.items():
 data=strip_metadata((source/original).read_bytes());(dest/name).write_bytes(data)
 manifest.append({'asset':name,'sourceFilename':original,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
(dest/'sources.json').write_text(json.dumps({'credit':'現地写真：ユーザー提供（2026-11-15）','processing':'Original JPEG scan data; metadata removed. Runtime mesh UV projection and GPU size reduction only.','files':manifest},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
