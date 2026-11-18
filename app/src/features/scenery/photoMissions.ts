import type {Viewpoint} from './viewpoint';
import type {PhotoPose,VehicleId} from '../exploration/map/flight/avatarOptions';
export const PHOTO_MISSION_KEY='shinkai-photo-missions-v1';
export const PHOTO_MISSIONS=[
 {id:'byuo-evening',ja:'夕暮れのびゅうお',en:'View-O at sunset',preset:'byuuo',x:-276,y:76,z:22,radius:260,time:'evening'},
 {id:'onari-night',ja:'夜の御成橋',en:'Onari Bridge at night',preset:'onari-bridge',x:145,y:55,z:-1619,radius:260,time:'night'},
 {id:'cityhall-diver',ja:'市役所と潜水士',en:'A diver at City Hall',preset:'city-hall',x:548,y:75,z:-1567,radius:220,time:'day'},
 {id:'harbor-boat',ja:'港で船と記念撮影',en:'A boat photo at the harbor',preset:'harbor-life',x:-100,y:43,z:-140,radius:220,time:'day'},
] as const;
export type PhotoMissionId=typeof PHOTO_MISSIONS[number]['id'];
export type PhotoAchievements=Partial<Record<PhotoMissionId,{at:string;link:string}>>;
export function loadPhotoAchievements():PhotoAchievements{try{const raw=JSON.parse(localStorage.getItem(PHOTO_MISSION_KEY)??'{}');const result:PhotoAchievements={};for(const m of PHOTO_MISSIONS){const v=raw?.[m.id];if(v&&typeof v.at==='string'&&Number.isFinite(Date.parse(v.at))&&typeof v.link==='string'&&v.link.length<1000)result[m.id]={at:v.at,link:v.link};}return result;}catch{return {};}}
export function matchPhotoMissions(view:Viewpoint,pose:PhotoPose,vehicle:VehicleId,active:boolean):PhotoMissionId[]{
 const [cx,cy,cz]=view.camera,[tx,ty,tz]=view.target,dx=tx-cx,dy=ty-cy,dz=tz-cz,l=Math.hypot(dx,dy,dz);if(!l)return [];
 return PHOTO_MISSIONS.filter(m=>{
  const x=m.x-cx,y=m.y-cy,z=m.z-cz,d=Math.hypot(x,y,z),aim=(x*dx+y*dy+z*dz)/(d*l);
  if(d>m.radius||d<3)return false;
  if(m.id==='harbor-boat')return active&&pose!=='none'&&vehicle==='boat';
  if(aim<.72)return false;
  if(m.id==='byuo-evening')return view.atmosphere?.time==='evening';
  if(m.id==='onari-night')return view.atmosphere?.time==='night';
  if(m.id==='cityhall-diver')return active&&pose!=='none';
  return active&&pose!=='none'&&vehicle==='boat';
 }).map(m=>m.id);
}
export function recordPhotoAchievements(ids:PhotoMissionId[],link:string){const records=loadPhotoAchievements();for(const id of ids)records[id]={at:new Date().toISOString(),link};try{localStorage.setItem(PHOTO_MISSION_KEY,JSON.stringify(records));return{records,saved:true};}catch{return{records,saved:false};}}
