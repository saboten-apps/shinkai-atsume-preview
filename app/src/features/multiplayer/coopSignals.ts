export const SIGNAL_KINDS=['fish','photo','follow'] as const;
export type SignalKind=typeof SIGNAL_KINDS[number];
export interface CoopSignal{id:number;kind:SignalKind;fishId?:string}
export const validFishId=(id:unknown):id is string=>typeof id==='string'&&/^f(?:0[1-9]|1[0-9]|2[0-4])$/.test(id);
export function validSignal(v:unknown):v is CoopSignal{const s=v as CoopSignal|null;return !!s&&Number.isSafeInteger(s.id)&&s.id>0&&s.id<=2147483647&&SIGNAL_KINDS.includes(s.kind)&&(s.fishId===undefined||validFishId(s.fishId));}
export const SIGNAL_LABELS:Record<SignalKind,string>={fish:'ここに魚！',photo:'集まって撮影しよう',follow:'ついてきて'};
export class SignalComposer{
 private nextAt=-Infinity;private expires=0;private current:CoopSignal|undefined;private sequence=0;
 send(kind:SignalKind,now:number,fishId?:string){if(!SIGNAL_KINDS.includes(kind)||!Number.isFinite(now)||now<this.nextAt)return false;this.current={id:++this.sequence,kind,...(validFishId(fishId)?{fishId}:{})};this.nextAt=now+5000;this.expires=now+12000;return true;}
 get(now:number){return now<this.expires?this.current:undefined;}
 reset(){this.current=undefined;this.expires=0;}
}
export class SignalInbox{
 private seen=new Map<string,{session:string;id:number;at:number}>();
 accept(player:string,session:string,signal:CoopSignal,now:number){if(!validSignal(signal)||!Number.isFinite(now))return false;const previous=this.seen.get(player);if(previous?.session===session&&(signal.id<=previous.id||now-previous.at<5000))return false;this.seen.set(player,{session,id:signal.id,at:now});return true;}
 remove(player:string){this.seen.delete(player);}clear(){this.seen.clear();}
}
