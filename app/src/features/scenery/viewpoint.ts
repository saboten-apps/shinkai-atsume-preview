import {validSceneryMoment,type SceneryMoment} from '../exploration/map/atmosphere';
import {PLACES} from './places';
// Public viewpoint URLs contain virtual camera coordinates only, never fish or device location.
export type Vec3 = [number, number, number];
export interface Viewpoint { camera: Vec3; target: Vec3; focus: [number, number]; fov: number; atmosphere?:SceneryMoment }
export const VIEWS: Record<string, {ja:string; en:string; view:Viewpoint}> = {
  port:{ja:'沼津港',en:'Numazu harbor',view:{camera:[295,265,345],target:[-20,43,-190],focus:[-20,-190],fov:45}},
  'harbor-life':{ja:'港の釣り人・船',en:'Harbor anglers and boats',view:{camera:[-135,48,-158],target:[-153,43.5,-140],focus:[-153,-140],fov:45}},
  'street-furniture':{ja:'駅前通りの街並み',en:'Station street details',view:{camera:[200,58,-2275],target:[190,49,-2300],focus:[190,-2300],fov:55}},
  'onari-bridge':{ja:'御成橋のアーチ',en:'Onari Bridge arch',view:{camera:[145,62,-1480],target:[145,55,-1619],focus:[145,-1619],fov:55}},
  byuuo:{ja:'びゅうお周辺',en:'Around Byuuo',view:{camera:[-120,80,-65],target:[-276,76,22],focus:[-276,22],fov:55}},
  'city-hall':{ja:'市役所周辺',en:'Around City Hall',view:{camera:[671,108,-1478],target:[543,66,-1562],focus:[548,-1567],fov:55}},
};
for(const p of PLACES)if(!Object.prototype.hasOwnProperty.call(VIEWS,p.id)&&p.x!==undefined&&p.z!==undefined)VIEWS[p.id]={ja:p.ja,en:p.en,view:{camera:[p.x+120,140,p.z+160],target:[p.x,60,p.z],focus:[p.x,p.z],fov:55}};
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export function validView(v: Viewpoint): boolean {
  const vectors=[v.camera,v.target];
  return (v.atmosphere===undefined||validSceneryMoment(v.atmosphere))&&vectors.every(a=>Array.isArray(a)&&a.length===3&&a.every(finite)&&Math.abs(a[0])<=6500&&Math.abs(a[2])<=7500&&a[1]>=-100&&a[1]<=6000)
    &&Array.isArray(v.focus)&&v.focus.length===2&&v.focus.every(finite)
    &&v.focus[0]>=-1550&&v.focus[0]<=1450&&v.focus[1]>=-2580&&v.focus[1]<=1800
    &&finite(v.fov)&&v.fov>=20&&v.fov<=100
    &&Math.hypot(...v.camera.map((n,i)=>n-v.target[i]))>=1
    &&Math.hypot(...v.camera.map((n,i)=>n-v.target[i]))<=5000;
}
export function parseViewHash(hash:string): {view:Viewpoint; preset?:string}|null {
  if(hash.length>350)return null;
  const path=hash.replace(/^#\/?/,'');
  if(path==='view')return {view:VIEWS.port.view,preset:'port'};
  if(path.startsWith('view/') && Object.prototype.hasOwnProperty.call(VIEWS,path.slice(5)) && !path.includes('?'))return {view:VIEWS[path.slice(5)].view,preset:path.slice(5)};
  if(!path.startsWith('view/v1?'))return null;
  const q=new URLSearchParams(path.slice(8));
  if([...q.keys()].length!==(q.has('a')?5:4)||['c','t','p','f'].some(k=>q.getAll(k).length!==1)||(q.has('a')&&q.getAll('a').length!==1))return null;
  const tuple=(s:string|null,size:number)=>{
    if(!s)return null;const parts=s.split(',');
    if(parts.length!==size||parts.some(n=>!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(n)))return null;
    return parts.map(Number);
  };
  const c=tuple(q.get('c'),3),t=tuple(q.get('t'),3),p=tuple(q.get('p'),2),f=tuple(q.get('f'),1);
  if(!c||!t||!p||!f)return null;
  const view:Viewpoint={camera:c as Vec3,target:t as Vec3,focus:p as [number,number],fov:f[0]};
  if(q.has('a')){const [time,season,...rest]=q.get('a')!.split(',');const moment={time,season};if(rest.length||!validSceneryMoment(moment))return null;view.atmosphere=moment;}
  return validView(view)?{view}:null;
}
export function viewHash(view:Viewpoint):string {
  if(!validView(view))throw Error('Viewpoint outside supported town');
  const numbers=(v:number[])=>v.map(n=>Number(n.toFixed(2))).join(',');
  return `#/view/v1?c=${numbers(view.camera)}&t=${numbers(view.target)}&p=${numbers(view.focus)}&f=${numbers([view.fov])}${view.atmosphere?`&a=${view.atmosphere.time},${view.atmosphere.season}`:''}`;
}
export function viewUrl(view:Viewpoint,base:string):string {
  const url=new URL(base);url.search='';url.hash=viewHash(view).slice(1);return url.href;
}
