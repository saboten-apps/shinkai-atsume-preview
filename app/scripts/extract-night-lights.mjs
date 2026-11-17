// Uses source furniture tiles cached by import-street-furniture.mjs. Does not rebuild public models.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../public/environment/street-furniture/',import.meta.url),m=JSON.parse(await readFile(new URL('manifest.json',root))),points=new Map();
for(const chunk of m.chunks){const stats='/tmp/lights-'+chunk.id+'.json';execFileSync(process.execPath,[fileURLToPath(new URL('./lib/plateau-furniture-convert.mjs',import.meta.url)),chunk.id,'/tmp/night-lights-scratch.glb',stats,'2023-'+chunk.id],{env:{...process.env,EXTRACT_NIGHT_LIGHTS:'1'},stdio:'ignore'});const s=JSON.parse(await readFile(stats));if(s.failed.length)throw Error('Light extraction failed');for(const p of s.nightLights)if(!points.has(p.id)||points.get(p.id).y<p.y)points.set(p.id,p);}
await writeFile(new URL('night-lights.json',root),JSON.stringify({source:m.source,note:'Approximate luminaire positions from the upper geometry of source lighting facilities; virtual night lighting.',points:[...points.values()]}));console.log('Night lights:',points.size);
