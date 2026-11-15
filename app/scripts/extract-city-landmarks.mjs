// GSI experimental vector-map roads/labels, in the same WGS84 ENU frame as PLATEAU.
// Cached source: /tmp/shinkai-gsi-vectors/15-X-Y.pbf. No runtime map API required.
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {decodeTile,tileToLonLat} from './lib/mvt-decode.mjs';
const cache=process.env.GSI_VECTOR_CACHE||'/tmp/shinkai-gsi-vectors';
if(process.argv.includes('--download')){await mkdir(cache,{recursive:true});for(const x of [29022,29023])await Promise.all([12967,12968,12969,12970].map(async y=>{const response=await fetch(`https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/15/${x}/${y}.pbf`,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`GSI ${x}/${y}: ${response.status}`);await writeFile(`${cache}/15-${x}-${y}.pbf`,Buffer.from(await response.arrayBuffer()));}));}
const A=6378137,E2=6.69437999014e-3,lat0=35.0815*Math.PI/180,lon0=138.8576*Math.PI/180;
function ecef(lon,lat){lon*=Math.PI/180;lat*=Math.PI/180;const n=A/Math.sqrt(1-E2*Math.sin(lat)**2);return[n*Math.cos(lat)*Math.cos(lon),n*Math.cos(lat)*Math.sin(lon),n*(1-E2)*Math.sin(lat)];}
const o=ecef(138.8576,35.0815);
function enu([lon,lat]){const p=ecef(lon,lat).map((v,i)=>v-o[i]);return{x:Math.round((-Math.sin(lon0)*p[0]+Math.cos(lon0)*p[1])*100)/100,z:Math.round((Math.sin(lat0)*Math.cos(lon0)*p[0]+Math.sin(lat0)*Math.sin(lon0)*p[1]-Math.cos(lat0)*p[2])*100)/100};}
const features=[],sources=[];
for(const file of (await readdir(cache)).filter(f=>/^15-\d+-\d+\.pbf$/.test(f)).sort()){
 const [z,x,y]=file.split(/[.-]/).map(Number);sources.push(`https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/${z}/${x}/${y}.pbf`);
 for(const layer of decodeTile(await readFile(`${cache}/${file}`)))for(const feature of layer.features)features.push({...feature,layer:layer.name,parts:feature.parts.map(part=>part.map(([px,py])=>enu(tileToLonLat(px,py,layer.extent,x,y,z))))});
}
const labels=features.filter(f=>f.layer==='label'&&f.tags.annoCtg===413&&['港大橋','永代橋','御成橋','三園橋'].includes(f.tags.knj));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const bridges=labels.map((label,index)=>{
 const center=label.parts[0][0];
 const lines=features.filter(f=>f.layer==='road'&&f.tags.ftCode===2703&&f.parts.some(p=>p.some(v=>distance(v,center)<120)));
 const edges=lines.flatMap(f=>f.parts.map(points=>({points,tags:f.tags})));if(!edges.length)throw new Error(`No bridge road for ${label.tags.knj}`);
 const pool=edges.flatMap(e=>e.points);let a=pool[0],b=pool[0],span=0;for(const p of pool)for(const q of pool){const d=distance(p,q);if(d>span){span=d;a=p;b=q;}}
 return {id:['minato','eitai','onari','misono'][['港大橋','永代橋','御成橋','三園橋'].indexOf(label.tags.knj)],name:label.tags.knj,nameEn:({'港大橋':'Minato Bridge','永代橋':'Eitai Bridge','御成橋':'Onari Bridge','三園橋':'Misono Bridge'})[label.tags.knj],a,b,width:label.tags.knj==='御成橋'?14:12,center:{x:(a.x+b.x)/2,z:(a.z+b.z)/2},sourceFeatureCode:2703};
});
const unique=[...new Map(bridges.map(b=>[b.id,b])).values()];
const gateLine=features.filter(f=>f.layer==='structurel'&&f.tags.ftCode===5515).flatMap(f=>f.parts).find(p=>p.length===2&&p.every(v=>v.x>-400&&v.x<-200&&v.z>-100&&v.z<100)&&distance(p[0],p[1])>40);
if(!gateLine)throw new Error('Watergate structure line missing');
const watergate={id:'watergate',name:'沼津港大型展望水門（びゅうお）',nameEn:'View-O Watergate',a:gateLine[0],b:gateLine[1],center:{x:(gateLine[0].x+gateLine[1].x)/2,z:(gateLine[0].z+gateLine[1].z)/2},referenceUrl:'https://numazukanko.jp/spot/10020',referenceEntrance:{lat:35.081188,lon:138.854715},sourceFeatureCode:5515};
await writeFile(new URL('../src/features/exploration/cityStructures.v1.json',import.meta.url),JSON.stringify({source:'地理院タイル（国土地理院・ベクトル地図）を加工',sourceUrls:sources,note:'Bridge centerlines and names from GSI; deck width, elevation and details are approximations for this game.',bridges:unique,watergate},null,2)+'\n');
console.log(JSON.stringify(unique));
