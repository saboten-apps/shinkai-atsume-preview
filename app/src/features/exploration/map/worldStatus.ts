import {CITY_LANDMARKS,COMPASS_EN,COMPASS_JA} from '../navigation';
import {gameMoment,resolveAtmosphere,DEFAULT_ATMOSPHERE} from './atmosphere';
export function describeArea(x:number,z:number,en=false){
 if(!Number.isFinite(x)||!Number.isFinite(z))return en?'Numazu':'沼津の街';
 const nearest=CITY_LANDMARKS.filter(p=>!('far' in p)).map(p=>({p,d:Math.hypot(p.x-x,p.z-z)})).sort((a,b)=>a.d-b.d)[0];
 if(!nearest||nearest.d>1200)return en?'Numazu city area':'沼津市街';
 const name=en?nearest.p.nameEn:nearest.p.name;
 if(nearest.d<=450)return en?`${name} area`:name.endsWith('周辺')?name:`${name}周辺`;
 const heading=(Math.atan2(x-nearest.p.x,-(z-nearest.p.z))*180/Math.PI+360)%360,dir=(en?COMPASS_EN:COMPASS_JA)[Math.round(heading/45)%8];
 return en?`${(nearest.d/1000).toFixed(1)} km ${dir} of ${name}`:`${name}から${dir}へ${(nearest.d/1000).toFixed(1)}km`;
}
export function worldClockLabel(date=new Date(),en=false){
 const {hour,season}=gameMoment(date),period=resolveAtmosphere(DEFAULT_ATMOSPHERE,date).period;
 const time=`${String(Math.floor(hour)).padStart(2,'0')}:${String(Math.floor(hour%1*60)).padStart(2,'0')}`;
 const seasonName=({spring:['春','Spring'],summer:['夏','Summer'],autumn:['秋','Autumn'],winter:['冬','Winter']} as const)[season][en?1:0];
 const periodName=({morning:['朝','Morning'],day:['昼','Day'],evening:['夕方','Evening'],night:['夜','Night']} as const)[period][en?1:0];
 return{time,season:seasonName,period:periodName};
}
