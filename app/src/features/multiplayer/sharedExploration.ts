import * as THREE from 'three';
import {createClient, type RealtimeChannel} from '@supabase/supabase-js';
import {HumanoidCharacter} from '../exploration/map/flight/character';
import {validPose,WORLD_VERSION,type PlayerPose} from './protocol';
type LocalPose=Omit<PlayerPose,'id'|'name'|'world'|'seq'>;
export function setupSharedExploration(container:HTMLElement,scene:THREE.Scene,getPose:()=>LocalPose){
  const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
  const panel=document.createElement('details');panel.className='shared-exploration';
  panel.innerHTML='<summary>一緒に探索</summary><form><label>表示名 <input name="nickname" maxlength="16" value="ダイバー" required></label><label>招待コード <input name="room" maxlength="36" placeholder="空欄で新しい部屋"></label><button>参加・部屋を作る</button></form><p role="status"></p><button type="button" data-share hidden>招待リンクを共有</button><button type="button" data-leave hidden>退出</button>';
  panel.onkeydown=e=>e.stopPropagation();
  container.append(panel);
  const form=panel.querySelector('form')!,status=panel.querySelector('p')!,roomInput=panel.querySelector<HTMLInputElement>('[name=room]')!,nameInput=panel.querySelector<HTMLInputElement>('[name=nickname]')!,share=panel.querySelector<HTMLButtonElement>('[data-share]')!,leave=panel.querySelector<HTMLButtonElement>('[data-leave]')!;
  const invited=new URL(location.href).searchParams.get('room');if(invited){roomInput.value=invited;panel.open=true;}
  let disposed=false,channel:RealtimeChannel|null=null,seq=0,lastSent=0,joining=false;
  const id=crypto.randomUUID();let room='',name='';
  const peers=new Map<string,{avatar:HumanoidCharacter;pose:PlayerPose;seen:number;label:THREE.Sprite}>();
  const client=url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}}):null;
  function remove(id:string){const peer=peers.get(id);if(!peer)return;peer.avatar.dispose();peer.label.material.map?.dispose();peer.label.material.dispose();peers.delete(id);}
  function clear(){for(const id of peers.keys())remove(id);}
  async function exit(){const old=channel;channel=null;if(old){await old.untrack();await client?.removeChannel(old);}clear();form.hidden=false;share.hidden=leave.hidden=true;status.textContent='一人で探索しています';}
  function label(text:string){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#052640dd';ctx.fillRect(0,0,256,64);ctx.fillStyle='white';ctx.font='28px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,42);const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(4,1,1);sprite.position.y=2.4;return sprite;}
  form.onsubmit=async e=>{
    e.preventDefault();if(joining||channel)return;
    if(!client){status.textContent='共有探索の接続設定がまだありません。';return;}
    room=roomInput.value.trim()||crypto.randomUUID();if(!/^[a-f0-9-]{36}$/.test(room)){status.textContent='招待コードを確認してください';return;}
    name=nameInput.value.trim().slice(0,16)||'ダイバー';joining=true;status.textContent='接続中…';
    try{
      const auth=await client.auth.signInAnonymously();if(auth.error)throw auth.error;if(disposed)return;
      await client.realtime.setAuth(auth.data.session!.access_token);
      const next=client.channel(`explore:${room}`,{config:{private:true,broadcast:{self:false},presence:{key:id}}});channel=next;
      next.on('broadcast',{event:'pose'},({payload})=>{
        if(!validPose(payload)||payload.id===id||channel!==next)return;
        if(!payload.active){remove(payload.id);return;}
        let peer=peers.get(payload.id);if(peer&&payload.seq<=peer.pose.seq)return;
        if(!peer){if(peers.size>=3)return;const avatar=new HumanoidCharacter();avatar.group.visible=true;avatar.setPosition(new THREE.Vector3(payload.x,payload.y,payload.z));scene.add(avatar.group);const badge=label(payload.name);avatar.group.add(badge);avatar.group.traverse(o=>{if(o instanceof THREE.PointLight)o.visible=false;});peer={avatar,pose:payload,seen:performance.now(),label:badge};peers.set(payload.id,peer);}
        peer.pose=payload;peer.seen=performance.now();
      }).on('presence',{event:'leave'},({key})=>remove(key)).subscribe(async state=>{
        if(channel!==next||disposed)return;
        if(state==='SUBSCRIBED'){await next.track({name,world:WORLD_VERSION});form.hidden=true;share.hidden=leave.hidden=false;status.textContent='接続しました。飛行を開始すると姿を共有します。';}
        else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'){clear();status.textContent='通信を再接続中です。退出して入り直すこともできます。';leave.hidden=false;}
      });
    }catch{status.textContent='接続できませんでした。設定と通信を確認してください。';await exit();status.textContent='接続できませんでした。設定と通信を確認してください。';}finally{joining=false;}
  };
  leave.onclick=()=>void exit();
  share.onclick=async()=>{const link=new URL(location.href);link.searchParams.set('room',room);try{if(navigator.share)await navigator.share({title:'沼津で一緒に探索',url:link.href});else{await navigator.clipboard.writeText(link.href);status.textContent='招待リンクをコピーしました';}}catch{status.textContent='招待コード: '+room;}};
  const timer=window.setInterval(()=>{
    if(!channel||document.hidden)return;
    const now=performance.now();if(now-lastSent<100)return;lastSent=now;
    void channel.send({type:'broadcast',event:'pose',payload:{...getPose(),id,name,world:WORLD_VERSION,seq:++seq}});
    for(const [id,peer]of peers)if(now-peer.seen>8000)remove(id);
  },100);
  function visibility(){if(document.hidden){clear();void channel?.untrack();}else void channel?.track({name,world:WORLD_VERSION});}
  document.addEventListener('visibilitychange',visibility);
  return {update(dt:number,time:number){for(const peer of peers.values()){peer.avatar.group.position.lerp(new THREE.Vector3(peer.pose.x,peer.pose.y,peer.pose.z),1-Math.exp(-dt*12));peer.avatar.updatePose(peer.pose.yaw,peer.pose.speed,30,peer.pose.state,dt,time);}},dispose(){disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);void exit().finally(()=>client?.auth.stopAutoRefresh());panel.remove();}};
}
