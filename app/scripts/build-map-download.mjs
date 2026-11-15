import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../public/',import.meta.url),files=[];
async function walk(path){for(const e of await readdir(new URL(path,root),{withFileTypes:true})){const p=path+e.name;if(e.isDirectory())await walk(p+'/');else if(!p.startsWith('map/comparison/')&& !p.endsWith('download-manifest.json'))files.push(p);}}
await walk('map/data/');await walk('environment/');
const assets=[];for(const url of files.sort()){const b=await readFile(new URL(url,root));assets.push({url,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,16);
await writeFile(new URL('map/download-manifest.json',root),JSON.stringify({version,totalBytes:assets.reduce((s,a)=>s+a.bytes,0),assets}));
await writeFile(new URL('map-cache-sw.js',root),`const CACHE='shinkai-map-${version}';self.addEventListener('install',e=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method==='GET'&&u.origin===self.location.origin&&(u.pathname.includes('/map/data/')||u.pathname.includes('/environment/')||u.pathname.endsWith('/map/download-manifest.json'))){e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request))||fetch(e.request)));}});`);
console.log(`Map download: ${assets.length} assets, ${(assets.reduce((s,a)=>s+a.bytes,0)/1e6).toFixed(2)} MB`);
