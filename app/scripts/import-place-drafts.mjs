import fs from 'node:fs';import path from 'node:path';import ts from 'typescript';
const root=path.resolve(import.meta.dirname,'..');
const source=fs.readFileSync(path.join(root,'src/features/scenery/placeDraft.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
const {parseDrafts}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const input=process.argv[2];if(!input)throw Error('Usage: node scripts/import-place-drafts.mjs file.json [--apply]');
if(fs.statSync(input).size>1000000)throw Error('Input too large');
const drafts=parseDrafts(fs.readFileSync(input,'utf8'));
const target=path.join(root,'src/features/scenery/publishedPlaces.json');
const current=JSON.parse(fs.readFileSync(target,'utf8'));const next=[...current];
const records=fs.readdirSync(path.join(root,'public/map/data')).filter(n=>/^buildings-.*\.json$/.test(n)).flatMap(n=>JSON.parse(fs.readFileSync(path.join(root,'public/map/data',n),'utf8')).buildings);
const reserved={ 'city-hall':['bldg_6b50bdd6-c50a-4791-a8a3-2affe32f1c80','bldg_a05aab3b-f633-46a8-973a-be41451c06c1'],byuuo:['bldg_7380cb7d-8b33-48d5-b9d1-6324ae3d6526']};
for(const d of drafts){
 const record=records.find(r=>r.id===d.buildingId);if(!record||Math.hypot(record.center[0]-d.x,record.center[2]-d.z)>2)throw Error('Building ID/position mismatch: '+d.id);
 if(Object.entries(reserved).some(([id,ids])=>ids.includes(d.buildingId)&&id!==d.id))throw Error('Building already belongs to a built-in place');
 if(['port','v1'].includes(d.id)||reserved[d.id]&&!reserved[d.id].includes(d.buildingId))throw Error('Reserved place ID: '+d.id);
 if(!d.description||!d.photo||!d.photographer||!d.permission||!d.credit)throw Error('Publication needs description, photo, photographer, permission and credit: '+d.id);
 const photo=fs.realpathSync(path.join(root,'public',d.photo));if(!photo.startsWith(fs.realpathSync(path.join(root,'public'))+path.sep))throw Error('Photo outside public');
 if(!fs.statSync(photo).isFile())throw Error('Missing photo');
 if(next.some(p=>(p.id===d.id&&p.buildingId!==d.buildingId)||(p.buildingId===d.buildingId&&p.id!==d.id)))throw Error('Existing place/building conflict: '+d.id);
 const {photographer,permission,...publicPlace}=d; // Keep permission correspondence and provider records out of the public app.
 const i=next.findIndex(p=>p.id===d.id);if(i<0)next.push(publicPlace);else next[i]=publicPlace;
 console.log('Validated:',d.id,d.name);
}
if(process.argv.includes('--apply')){fs.writeFileSync(target,JSON.stringify(next,null,2)+'\n');console.log('Updated publishedPlaces.json. Review diff, run tests/build, then deploy.');}
else console.log('Check only. Add --apply to update the publication data.');
