import city from './cityStructures.v1.json';
export const COMPASS_JA=['北','北東','東','南東','南','南西','西','北西'];
export const COMPASS_EN=['N','NE','E','SE','S','SW','W','NW'];
export function cameraHeading(x:number,z:number,previous=0){return Math.hypot(x,z)<1e-5?previous:(Math.atan2(x,-z)*180/Math.PI+360)%360;}
export const CITY_LANDMARKS=[
 {id:'station',name:'沼津駅南口',nameEn:'Numazu Station south',x:210,z:-2395,y:85},
 {id:'port',name:'沼津港',nameEn:'Numazu Harbor',x:-130,z:-150,y:70},
 {id:'watergate',name:'びゅうお（水門）',nameEn:'View-O Watergate',...city.watergate.center,y:88},
 ...city.bridges.map(b=>({id:b.id,name:b.name,nameEn:b.nameEn,...b.center,y:59})),
 {id:'ashitaka',name:'愛鷹山',nameEn:'Mt. Ashitaka',x:-5800,z:-17350,y:1600,far:true},
 {id:'alps',name:'沼津アルプス',nameEn:'Numazu Alps',x:3960,z:2380,y:400,far:true},
 {id:'fuji',name:'富士山',nameEn:'Mt. Fuji',x:-11800,z:-30960,y:3900,far:true},
];
