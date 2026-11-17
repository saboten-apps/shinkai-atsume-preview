export interface MapManifest{version:string;totalBytes:number;assets:{url:string;bytes:number;sha256:string}[]}
export interface MapSaveProgress{done:number;total:number;reused:number;downloaded:number}
const PREFIX='shinkai-map-';
export const mapCacheName=(version:string,base:string)=>PREFIX+encodeURIComponent(new URL('./',base).pathname)+'-'+version;
const scopePrefix=(base:string)=>PREFIX+encodeURIComponent(new URL('./',base).pathname)+'-';
async function removeOwnedCache(storage:CacheStorage,key:string,base:string){
 if(key.startsWith(scopePrefix(base))){await storage.delete(key);return;}
 const cache=await storage.open(key),requests=await cache.keys(),root=new URL('./',base);const owned=requests.filter(r=>{const u=new URL(r.url);return u.origin===root.origin&&u.pathname.startsWith(root.pathname);});
 if(owned.length===requests.length)await storage.delete(key);else for(const r of owned)await cache.delete(r);
}
export async function removeMapAssets(base:string,storage:CacheStorage=caches){const index=new URL('map/download-manifest.json',base).href;for(const key of await storage.keys())if(key.startsWith(PREFIX)){const c=await storage.open(key);if(key.startsWith(scopePrefix(base))||await c.match(index))await removeOwnedCache(storage,key,base);}}
export async function mapCacheStatus(manifest:MapManifest,base:string,storage:CacheStorage=caches):Promise<'saved'|'outdated'|'none'>{
 const keys=await storage.keys(),name=mapCacheName(manifest.version,base);if(keys.includes(name)){const current=await storage.open(name);if((await Promise.all(manifest.assets.map(a=>current.match(new URL(a.url,base).href)))).every(Boolean))return 'saved';}
 const index=new URL('map/download-manifest.json',base).href;for(const key of keys)if(key.startsWith(PREFIX)&&await(await storage.open(key)).match(index))return 'outdated';return 'none';
}
function validManifest(value:unknown):value is MapManifest{
 const m=value as MapManifest|null;
 return !!m&&/^[a-f0-9]{16}$/.test(m.version)&&Array.isArray(m.assets)&&m.assets.length>0&&m.assets.every(a=>a&&typeof a.url==='string'&&/^(?:map\/data|environment)\/[a-zA-Z0-9_./-]+$/.test(a.url)&&!a.url.split('/').includes('..')&&Number.isSafeInteger(a.bytes)&&a.bytes>0&&/^[a-f0-9]{64}$/.test(a.sha256))&&new Set(m.assets.map(a=>a.url)).size===m.assets.length&&m.totalBytes===m.assets.reduce((n,a)=>n+a.bytes,0);
}
const checkAbort=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError');};
async function verified(response:Response|undefined,asset:MapManifest['assets'][number]):Promise<ArrayBuffer|null>{
 if(!response?.ok)return null;const bytes=await response.arrayBuffer();if(bytes.byteLength!==asset.bytes)return null;
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');return digest===asset.sha256?bytes:null;
}
function stored(bytes:ArrayBuffer,headers?:Headers,path=''){const clean=new Headers(headers);if(!clean.has('content-type'))clean.set('content-type',path.endsWith('.json')?'application/json':path.endsWith('.webp')?'image/webp':'application/octet-stream');clean.delete('content-encoding');clean.delete('content-length');return new Response(bytes,{headers:clean});}
/** Keep the previous usable map until the complete new version is verified.
 * Reuse only assets whose URL, expected hash, and actual cached bytes agree. */
export async function saveMapAssets(manifest:MapManifest,base:string,options:{signal?:AbortSignal;onProgress?:(p:MapSaveProgress)=>void;storage?:CacheStorage;fetcher?:typeof fetch}={}){
 if(!validManifest(manifest))throw Error('Invalid map manifest');
 const storage=options.storage??caches,fetcher=options.fetcher??fetch,signal=options.signal;
 checkAbort(signal);
 const name=mapCacheName(manifest.version,base),cache=await storage.open(name),manifestUrl=new URL('map/download-manifest.json',base).href;
 const old:Array<{key:string;cache:Cache;assets:Map<string,string>}>=[];
 for(const key of await storage.keys())if(key.startsWith(PREFIX)&&key!==name){checkAbort(signal);const c=await storage.open(key);try{const r=await c.match(manifestUrl);if(!r)continue;const m=await r.json();if(validManifest(m))old.push({key,cache:c,assets:new Map(m.assets.map(a=>[a.url,a.sha256]))});}catch{/* A missing or partial old index cannot justify reusing its assets. */}}
 await cache.put(manifestUrl,new Response(JSON.stringify(manifest),{headers:{'content-type':'application/json'}}));
 const progress:MapSaveProgress={done:0,total:manifest.totalBytes,reused:0,downloaded:0};options.onProgress?.({...progress});
 for(const asset of manifest.assets){checkAbort(signal);const url=new URL(asset.url,base).href;let bytes=await verified(await cache.match(url),asset);
  if(!bytes){await cache.delete(url);for(const prior of old){if(prior.assets.get(asset.url)!==asset.sha256)continue;bytes=await verified(await prior.cache.match(url),asset);if(bytes)break;}}
  if(bytes){checkAbort(signal);await cache.put(url,stored(bytes,undefined,asset.url));progress.reused+=asset.bytes;}
  else{const fresh=new URL(url);fresh.searchParams.set('map-download',asset.sha256);const response=await fetcher(fresh.href,{signal,cache:'no-store'});const headers=response.headers;bytes=await verified(response,asset);if(!bytes)throw Error('Map data integrity mismatch');checkAbort(signal);await cache.put(url,stored(bytes,headers,asset.url));progress.downloaded+=asset.bytes;}
  progress.done+=asset.bytes;options.onProgress?.({...progress});
 }
 checkAbort(signal);for(const {key} of old)await removeOwnedCache(storage,key,base);
 return progress;
}
