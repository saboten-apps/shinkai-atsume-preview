export const WORLD_VERSION='numazu-2023-v1';
export interface PlayerPose {id:string;name:string;x:number;y:number;z:number;yaw:number;speed:number;state:'ground'|'air'|'water';active:boolean;world:string;seq:number}
export function validPose(p:unknown):p is PlayerPose {
  if(!p||typeof p!=='object')return false;
  const v=p as PlayerPose;
  return typeof v.id==='string'&&/^[a-f0-9-]{36}$/.test(v.id)&&typeof v.name==='string'&&v.name.length<=16&&v.world===WORLD_VERSION&&typeof v.active==='boolean'&&['ground','air','water'].includes(v.state)&&[v.x,v.y,v.z,v.yaw,v.speed,v.seq].every(Number.isFinite)&&Math.abs(v.x)<10000&&Math.abs(v.z)<10000&&v.y>-1000&&v.y<10000&&Math.abs(v.yaw)<100&&v.speed>=0&&v.speed<=500&&Number.isSafeInteger(v.seq)&&v.seq>=0;
}
