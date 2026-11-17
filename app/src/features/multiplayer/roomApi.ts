import type { SupabaseClient } from '@supabase/supabase-js';
import { INVITE_TOKEN } from './invitation';
import { UUID, WORLD_VERSION } from './protocol';
export interface Room {room_id:string;session_id:string;expires_at:string;invite_token?:string}
export interface Member {user_id:string;session_id:string;display_name:string}
export async function openRoom(client:SupabaseClient, name:string, session:string, token:string|null):Promise<Room> {
  if(token!==null&&!INVITE_TOKEN.test(token))throw new Error('INVALID_INVITE');
  const result=token===null
    ?await client.rpc('create_exploration_room',{p_name:name,p_session_id:session,p_world:WORLD_VERSION})
    :await client.rpc('join_exploration_room',{p_name:name,p_session_id:session,p_token:token,p_world:WORLD_VERSION});
  if(result.error)throw result.error;
  const room=result.data as Room;
  if(!room || !UUID.test(room.room_id) || room.session_id!==session || !Number.isFinite(Date.parse(room.expires_at))
    || (token===null && !INVITE_TOKEN.test(room.invite_token??'')))throw new Error('INVALID_ROOM_RESPONSE');
  return room;
}
export async function roomMembers(client:SupabaseClient,room:string):Promise<Member[]> {
  const {data,error}=await client.rpc('list_exploration_members',{p_room_id:room});
  if(error)throw error;
  if(!Array.isArray(data)||data.length>4||!data.every(m=>UUID.test(m.user_id)&&UUID.test(m.session_id)&&typeof m.display_name==='string'&&m.display_name.length<=16))throw new Error('INVALID_MEMBERS');
  return data;
}
export const SHARED_AUTH_STORAGE_KEY='shinkai_shared_auth_v1';
export async function ensureSharedSession(client:SupabaseClient,captcha:()=>Promise<string>) {
  const existing=await client.auth.getSession();if(existing.error)throw existing.error;
  if(existing.data.session)return existing.data.session;
  const captchaToken=await captcha();
  const result=await client.auth.signInAnonymously({options:{captchaToken}});
  if(result.error)throw result.error;if(!result.data.session)throw new Error('NO_SESSION');return result.data.session;
}
export function connectionError(error:unknown):string {
  const value=error as {status?:number;message?:string;code?:string};
  if(value?.status===429||value?.code==='over_request_rate_limit')return '接続回数の上限です。時間を置いて再試行してください。';
  const message=value?.message??'';
  if(/HOST_REQUIRED/.test(message))return '部屋を作れるのは主催者のみです。招待リンクから参加してください。';
  if(/ROOM_FULL/.test(message))return 'この部屋は満員です。';
  if(/WORLD_MISMATCH/.test(message))return '街の版が異なります。画面を更新してください。';
  if(/INVALID_INVITE|ROOM_EXPIRED/.test(message))return '招待リンクが無効か、部屋が終了しました。';
  if(/EXPLORATION_PAUSED/.test(message)||value?.status===503)return '共有探索は休止中です。一人で探索できます。';
  if(/CAPTCHA/.test(message))return '参加の確認を完了してください。認証設定も確認してください。';
  return '接続できませんでした。通信状態を確認してください。サービスが休止中の可能性もあります。';
}
