#!/usr/bin/env python3
"""Build a lightweight landscape from GSI DEM tiles in the PLATEAU ENU frame."""
import argparse, array, concurrent.futures, hashlib, io, json, math, pathlib, struct, subprocess, tempfile, urllib.request
from PIL import Image
parser=argparse.ArgumentParser()
parser.add_argument('--gltfpack',required=True)
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parents[1]
cache=pathlib.Path(tempfile.gettempdir())/'shinkai-regional-dem';cache.mkdir(exist_ok=True)
zoom=10;size=256*2**zoom
bbox={'west':138.60,'east':139.13,'south':34.97,'north':35.43}
def pixel(lon,lat):return ((lon+180)/360*size,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*size)
def ll(px,py):return (px/size*360-180,math.degrees(math.atan(math.sinh(math.pi*(1-2*py/size)))))
x0,y0=map(math.floor,pixel(bbox['west'],bbox['north']));x1,y1=map(math.ceil,pixel(bbox['east'],bbox['south']))
width=x1-x0+1;height=y1-y0+1
urls=[]
for ty in range(y0//256,y1//256+1):
 for tx in range(x0//256,x1//256+1):urls.append((tx,ty,f'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{zoom}/{tx}/{ty}.png'))
def load(item):
 tx,ty,url=item;p=cache/f'{zoom}-{tx}-{ty}.png'
 if not p.exists():
  with urllib.request.urlopen(url,timeout=45) as response:p.write_bytes(response.read())
 return (tx,ty),Image.open(io.BytesIO(p.read_bytes())).convert('RGB')
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:tiles=dict(pool.map(load,urls))
def elevation(px,py):
 r,g,b=tiles[px//256,py//256].getpixel((px%256,py%256));v=r*65536+g*256+b
 if v==2**23:return 0.0
 return (v if v<2**23 else v-2**24)*.01
heights=[max(0.,elevation(x,y)) for y in range(y0,y1+1) for x in range(x0,x1+1)]
a=6378137.;e2=6.69437999014e-3;lat0=math.radians(35.0815);lon0=math.radians(138.8576)
sp,cp,sl,cl=math.sin(lat0),math.cos(lat0),math.sin(lon0),math.cos(lon0)
n0=a/math.sqrt(1-e2*sp*sp);origin=(n0*cp*cl,n0*cp*sl,n0*(1-e2)*sp)
def enu(lon,lat,alt):
 p,l=math.radians(lat),math.radians(lon);n=a/math.sqrt(1-e2*math.sin(p)**2);h=alt+39.7065
 dx=(n+h)*math.cos(p)*math.cos(l)-origin[0];dy=(n+h)*math.cos(p)*math.sin(l)-origin[1];dz=(n*(1-e2)+h)*math.sin(p)-origin[2]
 return (-sl*dx+cl*dy,cp*cl*dx+cp*sl*dy+sp*dz,sp*cl*dx+sp*sl*dy-cp*dz)
def srgb(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def smooth(a,b,v):
 t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
positions=array.array('f');colors=array.array('f');indices=array.array('I')
for row in range(height):
 for col in range(width):
  i=row*width+col;h=heights[i];lon,lat=ll(x0+col+.5,y0+row+.5);p=enu(lon,lat,h);positions.extend(p)
  dx=(heights[row*width+min(width-1,col+1)]-heights[row*width+max(0,col-1)])/250
  dz=(heights[min(height-1,row+1)*width+col]-heights[max(0,row-1)*width+col])/250
  normal=(-dx,1,-dz);norm=math.sqrt(sum(v*v for v in normal));light=.67+.33*max(0,(-dx*.45+.82-dz*.34)/norm)
  # Natural forest/volcanic slopes. The static snow line is an artistic treatment.
  forest=(63,88,66);plain=(143,143,117);rock=(112,113,111);snow=(238,243,239)
  t=smooth(12,100,h);rgb=[plain[k]*(1-t)+forest[k]*t for k in range(3)]
  t=smooth(1800,2650,h);rgb=[rgb[k]*(1-t)+rock[k]*t for k in range(3)]
  t=smooth(2650+90*math.sin(lon*80),3000,h);rgb=[rgb[k]*(1-t)+snow[k]*t for k in range(3)]
  colors.extend(srgb(v/255)*light for v in rgb)
for row in range(height-1):
 for col in range(width-1):
  a0=row*width+col;b=a0+1;c=a0+width;d=c+1
  for tri in [(a0,c,b),(b,c,d)]:
   if max(heights[v] for v in tri)<2:continue
   cx=sum(positions[v*3] for v in tri)/3;cz=sum(positions[v*3+2] for v in tri)/3
   # The detailed playable DEM remains the authority inside the corridor.
   if -710<cx<1075 and -2750<cz<745:continue
   indices.extend(tri)
def vec_range(data,axis):return [min(data[axis::3]),max(data[axis::3])]
position_ranges=[vec_range(positions,i) for i in range(3)]
chunks=[positions.tobytes(),colors.tobytes(),indices.tobytes()];offsets=[];binary=b''
for chunk in chunks:
 offsets.append(len(binary));binary+=chunk;binary+=b'\0'*((-len(binary))%4)
meta={'source':'地理院タイル（標高タイル DEM10B）を加工','sourceUrl':'https://maps.gsi.go.jp/development/ichiran.html','zoom':zoom,'bbox':bbox,'origin':{'lat':35.0815,'lon':138.8576,'height':0},'geoidOffset':39.7065,'verticalExaggeration':1,'grid':{'width':width,'height':height},'triangles':len(indices)//3,'maxElevation':max(heights),'tiles':[u for _,_,u in urls]}
# Geographic checkpoints are recorded for reproducibility, not used to deform the mesh.
meta['checkpoints']=[]
for name,lon,lat in [('愛鷹山・越前岳',138+47/60+38/3600,35+14/60+17/3600),('沼津アルプス・鷲頭山周辺',138.901111,35.060),('沼津アルプス・香貫山周辺',138.8758,35.0918),('富士山',138.7274,35.3606)]:
 px,py=pixel(lon,lat);col=max(0,min(width-1,round(px-x0)));row=max(0,min(height-1,round(py-y0)))
 region=[heights[r*width+c] for r in range(max(0,row-2),min(height,row+3)) for c in range(max(0,col-2),min(width,col+3))]
 meta['checkpoints'].append({'name':name,'lon':lon,'lat':lat,'sampleElevation':heights[row*width+col],'nearbyMax':max(region)})
j={'asset':{'version':'2.0','generator':'Shinkai GSI regional terrain','extras':meta},'extensionsUsed':['KHR_materials_unlit'],'buffers':[{'byteLength':len(binary)}],'bufferViews':[{'buffer':0,'byteOffset':off,'byteLength':len(data),'target':34963 if i==2 else 34962} for i,(off,data) in enumerate(zip(offsets,chunks))],'accessors':[{'bufferView':0,'componentType':5126,'count':len(positions)//3,'type':'VEC3','min':[p[0] for p in position_ranges],'max':[p[1] for p in position_ranges]},{'bufferView':1,'componentType':5126,'count':len(colors)//3,'type':'VEC3'},{'bufferView':2,'componentType':5125,'count':len(indices),'type':'SCALAR'}],'materials':[{'name':'regional-natural-colors','pbrMetallicRoughness':{'baseColorFactor':[1,1,1,1]},'extensions':{'KHR_materials_unlit':{}}}],'meshes':[{'name':'numazu-regional-terrain','primitives':[{'attributes':{'POSITION':0,'COLOR_0':1},'indices':2,'material':0}]}],'nodes':[{'mesh':0,'name':'numazu-regional-terrain'}],'scenes':[{'nodes':[0]}],'scene':0}
js=json.dumps(j,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*((-len(js))%4)
raw=cache/'numazu-region-raw.glb';raw.write_bytes(struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)
out=root/'public/environment/numazu-region.glb'
subprocess.run([args.gltfpack,'-i',str(raw),'-o',str(out),'-cc','-vp','16','-vc','8','-kn'],check=True)
meta['bytes']=out.stat().st_size;meta['sha256']=hashlib.sha256(out.read_bytes()).hexdigest()
(root/'public/environment/numazu-region.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in meta.items() if k!='tiles'},ensure_ascii=False,indent=2))
