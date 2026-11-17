import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../public/',import.meta.url),files=[];
async function walk(path){for(const e of await readdir(new URL(path,root),{withFileTypes:true})){const p=path+e.name;if(e.isDirectory())await walk(p+'/');else if(!p.startsWith('map/comparison/')&& !p.endsWith('download-manifest.json')&& !p.endsWith('-internal.json')&& !p.startsWith('map/data/buildings-'))files.push(p);}}
await walk('map/data/');await walk('environment/');
const assets=[];for(const url of files.sort()){const b=await readFile(new URL(url,root));assets.push({url,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,16);
await writeFile(new URL('map/download-manifest.json',root),JSON.stringify({version,totalBytes:assets.reduce((s,a)=>s+a.bytes,0),assets}));
const data={version,totalBytes:assets.reduce((s,a)=>s+a.bytes,0),assets};
await writeFile(new URL('map-cache-sw.js',root),`
const BASE=new URL('./',self.location.href);
const DATA=${JSON.stringify(data)};
const CACHE='shinkai-map-'+encodeURIComponent(BASE.pathname)+'-'+DATA.version;
const INDEX=new URL('map/download-manifest.json',BASE).href;
const EXPECTED=new Map(DATA.assets.map(a=>[new URL(a.url,BASE).href,a]));
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
async function reuseLegacy(request,cache){
 const url=new URL(request.url);url.search='';const expected=EXPECTED.get(url.href);if(!expected)return null;
 for(const key of await caches.keys()){
  if(!key.startsWith('shinkai-map-')||key===CACHE)continue;
  const old=await caches.open(key);
  try{
   const index=await old.match(INDEX);if(!index)continue;const manifest=await index.json();
   if(!manifest.assets?.some(a=>a.url===expected.url&&a.sha256===expected.sha256&&a.bytes===expected.bytes))continue;
   const response=await old.match(url.href);if(!response?.ok)continue;const bytes=await response.arrayBuffer();if(bytes.byteLength!==expected.bytes)continue;
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==expected.sha256)continue;
   const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length');
   const verified=new Response(bytes,{headers});await cache.put(url.href,verified.clone());return verified;
  }catch{}
 }
 return null;
}
self.addEventListener('fetch',e=>{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==BASE.origin||!(u.pathname.startsWith(BASE.pathname+'map/data/')||u.pathname.startsWith(BASE.pathname+'environment/')||u.pathname===new URL(INDEX).pathname))return;
 e.respondWith((async()=>{
  if(u.searchParams.has('map-download'))return fetch(e.request);
  if(u.pathname===new URL(INDEX).pathname){try{const response=await fetch(e.request);if(response.ok)return response;}catch{}return new Response(JSON.stringify(DATA),{headers:{'content-type':'application/json'}});}
  const cache=await caches.open(CACHE),existing=await cache.match(e.request);if(existing)return existing;
  const reused=await reuseLegacy(e.request,cache);return reused||fetch(e.request);
 })());
});
`);

console.log(`Map download: ${assets.length} assets, ${(assets.reduce((s,a)=>s+a.bytes,0)/1e6).toFixed(2)} MB`);
