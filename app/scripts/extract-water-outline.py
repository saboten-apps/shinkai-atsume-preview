#!/usr/bin/env python3
"""Use the existing PLATEAU water meshes for the lightweight 2D map as well."""
import argparse,collections,json,pathlib,struct
parser=argparse.ArgumentParser();parser.add_argument('--models',default='/workspace/shinkai-atsume-preview/realdata-test');args=parser.parse_args()
def clip(poly):
 for axis,bound,above in [(0,-500,True),(0,700,False),(1,-2580,True),(1,300,False)]:
  if not poly:break
  result=[];previous=poly[-1];pin=previous[axis]>=bound if above else previous[axis]<=bound
  for point in poly:
   inside=point[axis]>=bound if above else point[axis]<=bound
   if pin!=inside:
    t=(bound-previous[axis])/(point[axis]-previous[axis]);result.append(tuple(previous[i]+t*(point[i]-previous[i]) for i in range(2)))
   if inside:result.append(point)
   previous=point;pin=inside
  poly=result
 return poly

def simplify(points):
 if len(points)<=2:return points
 a,b=points[0],points[-1];dx,dy=b[0]-a[0],b[1]-a[1];denom=dx*dx+dy*dy
 values=[]
 for p in points[1:-1]:
  t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denom)) if denom else 0
  values.append((p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2)
 if not values or max(values)<.6**2:return [a,b]
 k=values.index(max(values))+1;return simplify(points[:k+1])[:-1]+simplify(points[k:])

def outline(name):
 raw=(pathlib.Path(args.models)/name).read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);binary=raw[28+n:]
 def accessor(i):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];size={'SCALAR':1,'VEC3':3}[a['type']];code={5126:'f',5125:'I',5123:'H'}[a['componentType']];stride=v.get('byteStride',struct.calcsize(code)*size);start=v.get('byteOffset',0)+a.get('byteOffset',0)
  return [struct.unpack_from('<'+code*size,binary,start+k*stride) for k in range(a['count'])]
 points=[];lookup={};edges=collections.Counter()
 for mesh in j['meshes']:
  for primitive in mesh['primitives']:
   ps=accessor(primitive['attributes']['POSITION']);ids=[x[0] for x in accessor(primitive['indices'])] if 'indices'in primitive else list(range(len(ps)));mapped=[]
   for x,y,z in ps:
    key=(round(x,2),round(z,2))
    if key not in lookup:lookup[key]=len(points);points.append(key)
    mapped.append(lookup[key])
   for k in range(0,len(ids),3):
    a,b,c=[mapped[t] for t in ids[k:k+3]]
    for u,v in [(a,b),(b,c),(c,a)]:
     if u!=v:edges[tuple(sorted((u,v)))]+=1
 border={e for e,count in edges.items() if count==1};adj=collections.defaultdict(set)
 for u,v in border:adj[u].add(v);adj[v].add(u)
 paths=[]
 while border:
  u,v=next(iter(border));start=u;ring=[u]
  while True:
   edge=tuple(sorted((u,v)))
   if edge not in border:break
   border.remove(edge);ring.append(v)
   if v==start:break
   following=next((w for w in adj[v] if tuple(sorted((v,w))) in border),None)
   if following is None:break
   u,v=v,following
  if len(ring)>3 and ring[-1]==start:
   poly=clip([points[i] for i in ring[:-1]])
   if len(poly)<3:continue
   poly=simplify(poly+[poly[0]])[:-1]
   if len(poly)>2:paths.append('M'+'L'.join(f'{x:.1f} {z:.1f}' for x,z in poly)+'Z')
 return ''.join(paths)
result={key:outline(f'corridor-water-{key}.glb') for key in ['sea','river']}
root=pathlib.Path(__file__).resolve().parents[1];(root/'src/features/exploration/waterOutline.v1.json').write_text(json.dumps(result,separators=(',',':'))+'\n');print({k:len(v) for k,v in result.items()})
