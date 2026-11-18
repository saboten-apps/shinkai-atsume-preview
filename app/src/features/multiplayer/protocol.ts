import {isAvatar,isPhotoPose,isVehicle,type AvatarId,type PhotoPose,type VehicleId} from '../exploration/map/flight/avatarOptions';
import { FREE_FLIGHT_CONFIG } from '../exploration/map/flight/constants';
export const WORLD_VERSION = 'numazu-2023-pose-v2';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// domain.BOUNDS is the older fish-search area, not the expanded playable city.
export const POSE_BOUNDS = FREE_FLIGHT_CONFIG.bounds;
export const POSE_MARGIN = 50;
export interface LocalPose {
  avatar?:AvatarId; pose?:PhotoPose; vehicle?:VehicleId;
  x:number; y:number; z:number; vx:number; vy:number; vz:number;
  yaw:number; speed:number; state:'ground'|'air'|'water'; active:boolean;
}
export interface PlayerPose extends LocalPose { id:string; session:string; world:string; seq:number }
export function validLocalPose(value:unknown):value is LocalPose {
  if (!value || typeof value !== 'object') return false;
  const p=value as LocalPose, b=POSE_BOUNDS, m=POSE_MARGIN;
  return (p.avatar===undefined||isAvatar(p.avatar))&&(p.pose===undefined||isPhotoPose(p.pose))&&(p.vehicle===undefined||isVehicle(p.vehicle))
    &&(p.vehicle!=='submarine'||p.state==='water')
    && [p.x,p.y,p.z,p.vx,p.vy,p.vz,p.yaw,p.speed].every(Number.isFinite)
    && p.x>=b.minX-m && p.x<=b.maxX+m && p.z>=b.minZ-m && p.z<=b.maxZ+m
    && p.y>=b.minY-m && p.y<=b.maxY+m && Math.abs(p.yaw)<=Math.PI*2
    // Falling has a larger vertical velocity than the normal flight speed.
    && Math.hypot(p.vx,p.vy,p.vz)<=150 && p.speed>=0 && p.speed<=150
    && Math.abs(p.speed-Math.hypot(p.vx,p.vy,p.vz))<.2
    && ['ground','air','water'].includes(p.state) && typeof p.active==='boolean';
}
export function validPose(value:unknown):value is PlayerPose {
  const p=value as PlayerPose;
  return validLocalPose(value) && typeof p.id==='string' && UUID.test(p.id)
    && typeof p.session==='string' && UUID.test(p.session) && p.world===WORLD_VERSION
    && Number.isSafeInteger(p.seq) && p.seq>=0;
}
// Only a brief extrapolation, then freeze. Never extrapolate a missing peer indefinitely.
export function predictPosition(p:LocalPose, ageMs:number) {
  const seconds=Math.max(0,Math.min(ageMs,350))/1000, b=POSE_BOUNDS;
  const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
  return {x:clamp(p.x+p.vx*seconds,b.minX,b.maxX),y:clamp(p.y+p.vy*seconds,b.minY,b.maxY),z:clamp(p.z+p.vz*seconds,b.minZ,b.maxZ)};
}
