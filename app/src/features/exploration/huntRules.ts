/** Game mechanics, not claims about species' real habitats or behavior. */
export type HuntKind='observe'|'night'|'light'|'school'|'track';
export interface HuntInput{distance:number;visible:boolean;night:boolean;light:boolean;aim:number;active:boolean}
export interface HuntStatus{kind:HuntKind;progress:number;ready:boolean}
export function huntKind(id:string):HuntKind{
 if(['f02','f10','f21'].includes(id))return 'night';
 if(['f01','f08','f18'].includes(id))return 'light';
 if(['f03','f11','f15'].includes(id))return 'school';
 if(['f07','f16','f22'].includes(id))return 'track';return 'observe';
}
export const HUNT_HINTS:Record<HuntKind,[string,string]>={observe:['近づいて、魚をしばらく観察しよう','Get close and observe the fish.'],night:['夜に姿を見せる魚。「移動・景色」で夜にしよう','This game fish appears at night. Change the time in Places & sky.'],light:['探査ライトをONにし、画面中央で魚を照らそう','Turn on the survey light and aim the center at the fish.'],school:['小さな群れを見つけて、近くで観察しよう','Find the small school and watch it nearby.'],track:['泳ぐ魚を追いかけて、近くで観察しよう','Follow the swimming fish and watch it up close.']};
export class HuntTracker{
 private held=0;
 constructor(readonly kind:HuntKind){}
 update(dt:number,input:HuntInput):HuntStatus{
  const allowed=input.active&&input.visible&&input.distance<=(this.kind==='track'?16:20)&&(this.kind!=='night'||input.night)&&(this.kind!=='light'||input.light&&input.aim>.78);
  this.held=allowed?Math.min(2,this.held+Math.max(0,Math.min(dt,.25))):0;
  const need=this.kind==='observe'?.75:1.5;
  return{kind:this.kind,progress:Math.min(1,this.held/need),ready:this.held>=need};
 }
}
export function fishMotion(id:string,index:number,time:number,reduced=false){
 const kind=huntKind(id),t=reduced?index:time*(kind==='track'?.45:.24)+index*1.7,r=kind==='track'?9:2;
 return{x:Math.sin(t)*r,y:Math.sin(t*1.8)*.3,z:Math.cos(t)*(kind==='track'?7:1.5),yaw:Math.atan2(Math.sin(t),Math.cos(t))};
}
