import {expect,it,vi} from 'vitest';
import {saveMapAssets,mapCacheName,mapCacheStatus,removeMapAssets,type MapManifest} from '../features/exploration/mapDownloadCache';
const BASE='https://town.test/preview/',INDEX=BASE+'map/download-manifest.json';
class MemoryCache{data=new Map<string,Response>();async match(url:string|Request){return this.data.get(typeof url==='string'?url:url.url)?.clone();}async put(url:string|Request,response:Response){this.data.set(typeof url==='string'?url:url.url,response.clone());}async delete(url:string|Request){return this.data.delete(typeof url==='string'?url:url.url);}async keys(){return [...this.data.keys()].map(url=>new Request(url));}}
class Storage{data=new Map<string,MemoryCache>();async open(name:string){if(!this.data.has(name))this.data.set(name,new MemoryCache());return this.data.get(name)!;}async keys(){return [...this.data.keys()];}async delete(name:string){return this.data.delete(name);}}
async function asset(url:string,text:string){const bytes=new TextEncoder().encode(text),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');return {url,bytes:bytes.length,sha256:hash};}
const manifest=(version:string,assets:MapManifest['assets']):MapManifest=>({version:version.repeat(16),assets,totalBytes:assets.reduce((n,a)=>n+a.bytes,0)});
async function oldMap(storage:Storage,m:MapManifest,bodies:string[]){const cache=await storage.open('shinkai-map-'+m.version);await cache.put(INDEX,new Response(JSON.stringify(m)));for(let i=0;i<m.assets.length;i++)await cache.put(BASE+m.assets[i].url,new Response(bodies[i]));return cache;}
it('reuses unchanged verified files and downloads only changed/new bytes',async()=>{
 const storage=new Storage(),a=await asset('environment/a.glb','aaa'),b=await asset('environment/b.glb','old'),nextB=await asset('environment/b.glb','new-b'),c=await asset('environment/c.glb','ccc');await oldMap(storage,manifest('a',[a,b]),['aaa','old']);
 const next=manifest('b',[a,nextB,c]),fetcher=vi.fn(async(url:string)=>{const u=new URL(url);expect(u.searchParams.get('map-download')).toHaveLength(64);return new Response(u.pathname.endsWith('b.glb')?'new-b':'ccc');});
 const result=await saveMapAssets(next,BASE,{storage:storage as never,fetcher:fetcher as never});expect(fetcher).toHaveBeenCalledTimes(2);expect(result).toMatchObject({reused:3,downloaded:8,done:11});expect(await storage.keys()).toEqual([mapCacheName(next.version,BASE)]);expect(await mapCacheStatus(next,BASE,storage as never)).toBe('saved');
});
it('preserves the previous map after a failed update and resumes verified partial files',async()=>{
 const storage=new Storage(),a=await asset('environment/a.glb','aaa'),b=await asset('environment/b.glb','bbb');await oldMap(storage,manifest('a',[a]),['aaa']);const next=manifest('b',[a,b]);
 await expect(saveMapAssets(next,BASE,{storage:storage as never,fetcher:vi.fn(async()=>new Response('wrong')) as never})).rejects.toThrow('integrity');expect((await storage.keys())).toContain('shinkai-map-'+'a'.repeat(16));
 const fetcher=vi.fn(async()=>new Response('bbb'));const result=await saveMapAssets(next,BASE,{storage:storage as never,fetcher:fetcher as never});expect(fetcher).toHaveBeenCalledOnce();expect(result.reused).toBe(3);
});
it('does not trust corrupted cached bytes just because their metadata hash matches',async()=>{
 const storage=new Storage(),a=await asset('environment/a.glb','valid');await oldMap(storage,manifest('a',[a]),['wrong']);const fetcher=vi.fn(async()=>new Response('valid'));await saveMapAssets(manifest('b',[a]),BASE,{storage:storage as never,fetcher:fetcher as never});expect(fetcher).toHaveBeenCalledOnce();
});
it('never removes another application sharing an older cache on the same origin',async()=>{
 const storage=new Storage(),a=await asset('environment/a.glb','aaa'),old=await oldMap(storage,manifest('a',[a]),['aaa']);const other='https://town.test/other/';await old.put(other+'map/download-manifest.json',new Response('{}'));await old.put(other+'environment/a.glb',new Response('other'));
 await saveMapAssets(manifest('b',[a]),BASE,{storage:storage as never,fetcher:vi.fn() as never});expect(await old.match(other+'environment/a.glb')).toBeDefined();expect(await old.match(INDEX)).toBeUndefined();await removeMapAssets(BASE,storage as never);expect(await old.match(other+'environment/a.glb')).toBeDefined();expect(await mapCacheStatus(manifest('b',[a]),BASE,storage as never)).toBe('none');
});
it('stops without discarding the old map when cancelled during progress',async()=>{
 const storage=new Storage(),a=await asset('environment/a.glb','aaa'),b=await asset('environment/b.glb','bbb');await oldMap(storage,manifest('a',[a]),['aaa']);const abort=new AbortController(),fetcher=vi.fn();await expect(saveMapAssets(manifest('b',[a,b]),BASE,{storage:storage as never,fetcher:fetcher as never,signal:abort.signal,onProgress:p=>{if(p.done)abort.abort();}})).rejects.toMatchObject({name:'AbortError'});expect(fetcher).not.toHaveBeenCalled();expect(await storage.keys()).toContain('shinkai-map-'+'a'.repeat(16));
});
