export type TimeChoice='auto'|'morning'|'day'|'evening'|'night';
export type SeasonChoice='auto'|'spring'|'summer'|'autumn'|'winter';
export interface AtmosphereChoice{time:TimeChoice;season:SeasonChoice}
export interface SceneryMoment{time:Exclude<TimeChoice,'auto'>;season:Exclude<SeasonChoice,'auto'>}
export function validSceneryMoment(value:unknown):value is SceneryMoment{return validAtmosphere(value)&&(value as AtmosphereChoice).time!=='auto'&&(value as AtmosphereChoice).season!=='auto';}
export const ATMOSPHERE_KEY='shinkai-scenery-atmosphere-v1';
export const DEFAULT_ATMOSPHERE:AtmosphereChoice={time:'auto',season:'auto'};
export function validAtmosphere(value:unknown):value is AtmosphereChoice{const v=value as AtmosphereChoice|null;return !!v&&['auto','morning','day','evening','night'].includes(v.time)&&['auto','spring','summer','autumn','winter'].includes(v.season);}
export function loadAtmosphere():AtmosphereChoice{try{const v=JSON.parse(localStorage.getItem(ATMOSPHERE_KEY)??'null');return validAtmosphere(v)?v:{...DEFAULT_ATMOSPHERE};}catch{return {...DEFAULT_ATMOSPHERE};}}
export const SEASONS={spring:{rise:5.7,set:18.3,leaf:0x476e40,haze:.00032},summer:{rise:4.8,set:19,leaf:0x243e2b,haze:.00044},autumn:{rise:6,set:17.2,leaf:0x566044,haze:.00032},winter:{rise:6.8,set:16.8,leaf:0x304a41,haze:.00024}};
const PALETTES={
 night:{top:0x071021,horizon:0x24374e,cloud:0x364454,fog:0x24374e,sun:0xa9c9ee,water:0x082635,ambient:.48,direct:.16,fill:.22,night:1,photo:.26},
 morning:{top:0x6e9fc6,horizon:0xf0bd9d,cloud:0xf4d5bd,fog:0xbec5ca,sun:0xffd0a0,water:0x3c6f7d,ambient:.85,direct:1.05,fill:.45,night:0,photo:.95},
 day:{top:0x4590d4,horizon:0xc2e0f0,cloud:0xfafaf5,fog:0xc3dce8,sun:0xfff7ed,water:0x0e4558,ambient:.9,direct:1.4,fill:.6,night:0,photo:1},
 evening:{top:0x566e9d,horizon:0xf5ac80,cloud:0xf5b9a1,fog:0xb3a6b1,sun:0xffb77e,water:0x384d69,ambient:.72,direct:.7,fill:.35,night:.2,photo:.75},
};
export function resolveAtmosphere(choice:AtmosphereChoice,date=new Date()){
 const jst=new Date(date.getTime()+9*3600000),month=jst.getUTCMonth()+1;
 const season=choice.season==='auto'?(month>=3&&month<=5?'spring':month<=8&&month>=6?'summer':month>=9&&month<=11?'autumn':'winter'):choice.season;
 const settings=SEASONS[season],hour=choice.time==='auto'?jst.getUTCHours()+jst.getUTCMinutes()/60:choice.time==='morning'?settings.rise+.2:choice.time==='evening'?settings.set+.15:choice.time==='night'?22:12;
 const keys:[number,keyof typeof PALETTES][]=[[0,'night'],[settings.rise-.8,'night'],[settings.rise+.2,'morning'],[settings.rise+2,'day'],[settings.set-1,'day'],[settings.set+.15,'evening'],[settings.set+1.2,'night'],[24,'night']];
 const index=keys.findIndex(([h])=>h>hour),a=keys[Math.max(0,index-1)],b=keys[index<0?keys.length-1:index];
 let mix=b[0]===a[0]?0:(hour-a[0])/(b[0]-a[0]);mix=mix*mix*(3-2*mix);
 const daylight=Math.max(0,Math.min(1,(hour-settings.rise)/(settings.set-settings.rise)));
 return{period:mix>.5?b[1]:a[1],season,hour,settings,a:PALETTES[a[1]],b:PALETTES[b[1]],mix,sunAngle:Math.PI*daylight};
}
