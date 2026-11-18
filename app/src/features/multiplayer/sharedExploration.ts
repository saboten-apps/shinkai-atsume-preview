import {SignalComposer,SignalInbox,SIGNAL_LABELS,type SignalKind} from './coopSignals';
import catalog from '../../../data/fish.json';
import * as THREE from 'three';
import {createClient,type RealtimeChannel,type SupabaseClient} from '@supabase/supabase-js';
import {HumanoidCharacter} from '../exploration/map/flight/character';
import {validPose,predictPosition,type PlayerPose,type LocalPose} from './protocol';
import {PosePublisher} from './posePublisher';
import {clearInvitation,invitationFromHash,invitationUrl} from './invitation';
import {connectionError,ensureSharedSession,openRoom,roomMembers,SHARED_AUTH_STORAGE_KEY,type Room,type Member} from './roomApi';
import {requestCaptcha} from './turnstile';
let sharedClient:SupabaseClient|null=null;
export function setupSharedExploration(container:HTMLElement,scene:THREE.Scene,getPose:()=>LocalPose){
  const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
  const enabled=import.meta.env.VITE_SHARED_EXPLORATION_ENABLED==='true';
  const panel=document.createElement('details');panel.className='shared-exploration';
  panel.innerHTML='<summary>一緒に探索（招待限定）</summary><form><label>表示名 <input name="nickname" maxlength="16" value="ダイバー" required></label><p data-invitation></p><button>部屋を作る</button></form><div data-captcha></div><p role="status"></p><button type="button" data-share hidden>招待リンクを共有</button><button type="button" data-leave hidden>退出</button><div data-coop hidden><p>仲間への合図（5秒に1回）</p><button type="button" data-signal="fish">ここに魚！</button><button type="button" data-signal="photo">集まって撮影</button><button type="button" data-signal="follow">ついてきて</button></div><p role="status" data-signal-notice></p>';
  panel.onkeydown=e=>e.stopPropagation();container.append(panel);
  const form=panel.querySelector('form')!,status=panel.querySelector<HTMLElement>('[role=status]')!,input=panel.querySelector<HTMLInputElement>('input')!;
  const share=panel.querySelector<HTMLButtonElement>('[data-share]')!,leave=panel.querySelector<HTMLButtonElement>('[data-leave]')!,submit=form.querySelector('button')!;
  let invite=invitationFromHash(location.hash);
  const invalidInvite=location.hash.startsWith('#/join/')&&!invite;
  panel.querySelector('[data-invitation]')!.textContent=invalidInvite?'招待リンクを確認してください。':invite?'招待された部屋に参加します。':'家族・友人との試験用です。';
  if(location.hash.startsWith('#/join/')){panel.open=true;submit.textContent='招待された部屋に参加';}
  const client=enabled&&url&&key?(sharedClient??=createClient(url,key,{auth:{persistSession:true,storageKey:SHARED_AUTH_STORAGE_KEY,autoRefreshToken:true,detectSessionInUrl:false}})):null;
  let disposed=false,generation=0,connectionRevision=0,channel:RealtimeChannel|null=null,publisher:PosePublisher|null=null;
  let room:Room|null=null,myId='',ready=false,busy=false,inviteLink='',nextLease=0,leaseBusy=false,refreshing=false,refreshAgain=false;
  let captchaAbort=new AbortController();
  let members:Member[]=[];
  const composer=new SignalComposer(),inbox=new SignalInbox(),markers=new Map<string,{sprite:THREE.Sprite;until:number}>();
  const coop=panel.querySelector<HTMLElement>('[data-coop]')!,signalNotice=panel.querySelector<HTMLElement>('[data-signal-notice]')!;
  let noticeUntil=0;
  const clearMarker=(id:string)=>{const m=markers.get(id);if(m){m.sprite.removeFromParent();m.sprite.material.map?.dispose();m.sprite.material.dispose();markers.delete(id);}};
  for(const button of panel.querySelectorAll<HTMLButtonElement>('[data-signal]'))button.onclick=()=>{if(!connected()||!onlineMembers().length||!getPose().active)return;const pose=getPose();signalNotice.textContent=composer.send(button.dataset.signal as SignalKind,performance.now(),pose.hunt)?'仲間へ合図を送りました。':'合図は5秒おきに送れます。';noticeUntil=performance.now()+5000;};
  const peers=new Map<string,{avatar:HumanoidCharacter;pose:PlayerPose;seen:number;label:THREE.Sprite}>();
  function remove(id:string){clearMarker(id);inbox.remove(id);const p=peers.get(id);if(!p)return;p.avatar.dispose();p.label.material.map?.dispose();p.label.material.dispose();peers.delete(id);}
  function clear(){for(const id of peers.keys())remove(id);}
  function connected(){return ready&&channel?.state==='joined'&&channel.socket.isConnected();}
  function onlineMembers(){const state=channel?.presenceState<{session:string}>()??{};return members.filter(m=>m.user_id!==myId&&(state[m.user_id]??[]).some(p=>p.session===m.session_id));}
  async function release(old:Room){await client?.rpc('leave_exploration_room',{p_room_id:old.room_id,p_session_id:old.session_id});}
  async function exit(message='一人で探索しています'){
    generation++;connectionRevision++;captchaAbort.abort();publisher?.setStatus('CLOSED');publisher=null;ready=false;busy=false;
    const oldChannel=channel,oldRoom=room;channel=null;room=null;members=[];clear();composer.reset();inbox.clear();coop.hidden=true;signalNotice.textContent='';share.hidden=leave.hidden=true;form.hidden=false;submit.disabled=false;status.textContent=message;
    // Remove the local channel immediately; DB lease expires if the leave RPC cannot reach the server.
    await Promise.allSettled([oldChannel?client?.removeChannel(oldChannel):undefined,oldRoom?release(oldRoom):undefined]);
  }
  async function refreshMembers(g:number){
    if(refreshing){refreshAgain=true;return;}if(!client||!room)return;
    refreshing=true;const currentRoom=room;
    try {const list=await roomMembers(client,currentRoom.room_id);if(g!==generation||disposed)return;
      members=list;
      if(!list.some(m=>m.user_id===myId&&m.session_id===currentRoom.session_id)){void exit('部屋への参加期限が切れました。');return;}
      const online=onlineMembers();for(const [id,p]of peers)if(!online.some(m=>m.user_id===id&&m.session_id===p.pose.session))remove(id);
      if(connected())status.textContent=`接続中 · ${online.length+1}人 / 4人。飛行を開始すると姿を共有します。`;
    }catch(error){if(g===generation)void exit(connectionError(error));}
    finally{refreshing=false;if(refreshAgain){refreshAgain=false;void refreshMembers(generation);}}
  }
  function label(text:string){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#052640dd';ctx.fillRect(0,0,256,64);ctx.fillStyle='white';ctx.font='28px sans-serif';ctx.textAlign='center';ctx.fillText(text,128,42);const texture=new THREE.CanvasTexture(canvas);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(4,1,1);sprite.position.y=2.4;return sprite;}
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||channel||invalidInvite)return;
    if(!client){status.textContent='共有探索は準備中です。接続設定と招待試験の開始をお待ちください。';return;}
    busy=true;submit.disabled=true;leave.hidden=false;status.textContent='参加を確認しています…';
    const g=++generation;captchaAbort=new AbortController();
    try {
      const auth=await ensureSharedSession(client,()=>requestCaptcha(panel.querySelector('[data-captcha]')!,import.meta.env.VITE_TURNSTILE_SITE_KEY??'',captchaAbort.signal));
      if(g!==generation||disposed)return;myId=auth.user.id;
      const opened=await openRoom(client,input.value.trim().slice(0,16)||'ダイバー',crypto.randomUUID(),invite);
      if(g!==generation||disposed){await release(opened);return;}room=opened;
      const token=opened.invite_token??invite;inviteLink=token?invitationUrl(location.href,token):'';
      const next=client.channel(`explore:${opened.room_id}`,{config:{private:true,broadcast:{self:false},presence:{key:myId}}});
      channel=next;publisher=new PosePublisher(next,myId,opened.session_id);
      next.on('broadcast',{event:'pose'},({payload})=>{
        if(g!==generation||!connected()||document.hidden||!validPose(payload)||payload.id===myId)return;
        const member=onlineMembers().find(m=>m.user_id===payload.id&&m.session_id===payload.session);if(!member)return;
        let peer=peers.get(payload.id);
        if(peer&&peer.pose.session===payload.session&&payload.seq<=peer.pose.seq)return;
        if(!payload.active){remove(payload.id);return;}
        if(peer&&peer.pose.session!==payload.session){remove(payload.id);peer=undefined;}
        if(!peer){if(peers.size>=3)return;const avatar=new HumanoidCharacter();avatar.group.visible=true;avatar.setPosition(new THREE.Vector3(payload.x,payload.y,payload.z));scene.add(avatar.group);const badge=label(member.display_name);avatar.group.add(badge);avatar.group.traverse(o=>{if(o instanceof THREE.PointLight)o.visible=false;});peer={avatar,pose:payload,seen:performance.now(),label:badge};peers.set(payload.id,peer);}
        if(peer.avatar.group.userData.avatar!==(payload.avatar??'mendako'))peer.avatar.setAvatar(payload.avatar??'mendako');
        if(payload.signal&&inbox.accept(payload.id,payload.session,payload.signal,performance.now())){
          clearMarker(payload.id);const signal=payload.signal,text=SIGNAL_LABELS[signal.kind],name=signal.fishId?catalog.fish.find(f=>f.id===signal.fishId)?.name_ja:undefined;
          const marker=label(text);marker.scale.set(7,1.75,1);marker.position.set(payload.x,payload.y+3,payload.z);scene.add(marker);markers.set(payload.id,{sprite:marker,until:performance.now()+12000});
          signalNotice.textContent=member.display_name+'：'+text+(name?'（'+name+'）':'');noticeUntil=performance.now()+12000;
        }
        peer.avatar.setVehicle(payload.vehicle??'none');peer.pose=payload;peer.seen=performance.now();
      }).on('presence',{event:'sync'},()=>{if(g===generation)void refreshMembers(g);}).subscribe(async state=>{
        if(g!==generation||disposed)return;
        const revision=++connectionRevision;
        ready=state==='SUBSCRIBED';publisher?.setStatus('CLOSED');
        if(!ready){clear();status.textContent='通信を再接続中です。位置の送信は停止しています。';return;}
        try {
          // Validate lease again on reconnect before announcing presence.
          const result=await client.rpc('renew_exploration_membership',{p_room_id:opened.room_id,p_session_id:opened.session_id});
          if(result.error)throw result.error;if(g!==generation||revision!==connectionRevision||!connected())return;
          nextLease=performance.now()+45000;
          await refreshMembers(g);if(g!==generation||revision!==connectionRevision||!connected())return;
          if(!document.hidden&&await next.track({session:opened.session_id})!=='ok')throw new Error('PRESENCE_FAILED');
          if(g!==generation||revision!==connectionRevision||!connected())return;
          publisher?.setStatus('SUBSCRIBED');clearInvitation(location,history);invite=null;form.hidden=true;coop.hidden=false;share.hidden=!inviteLink;leave.hidden=false;
        }catch(error){if(g===generation&&revision===connectionRevision)void exit(connectionError(error));}
      });
    }catch(error){if(g===generation)await exit(connectionError(error));}
    finally{if(g===generation){busy=false;submit.disabled=false;}}
  };
  leave.onclick=()=>void exit();
  share.onclick=async()=>{try{if(navigator.share)await navigator.share({title:'沼津で一緒に探索',url:inviteLink});else{await navigator.clipboard.writeText(inviteLink);status.textContent='招待リンクをコピーしました';}}catch{status.textContent='共有を中止しました。';}};
  const timer=window.setInterval(()=>{
    const now=performance.now();
    for(const [id,peer]of peers)if(now-peer.seen>10000)remove(id);
    if(room&&Date.now()>=Date.parse(room.expires_at)){void exit('部屋の時間が終了しました。');return;}
    for(const [id,m]of markers)if(now>=m.until)clearMarker(id);if(now>=noticeUntil)signalNotice.textContent='';
    for(const button of coop.querySelectorAll<HTMLButtonElement>('button'))button.disabled=!connected()||!getPose().active||onlineMembers().length===0;
    publisher?.tick(now,{...getPose(),signal:composer.get(now)},onlineMembers().length,!document.hidden);
    if(connected()&&room&&client&&!document.hidden&&now>=nextLease&&!leaseBusy){
      leaseBusy=true;nextLease=now+45000;const g=generation,current=room;
      void Promise.resolve(client.rpc('renew_exploration_membership',{p_room_id:current.room_id,p_session_id:current.session_id})).then(({error})=>{if(g===generation&&error)void exit(connectionError(error));}).catch(error=>{if(g===generation)void exit(connectionError(error));}).finally(()=>{leaseBusy=false;});
    }
  },50);
  function visibility(){
    const revision=++connectionRevision;
    clear();publisher?.setStatus('CLOSED');
    if(!connected())return;
    if(document.hidden){void channel?.untrack();return;}
    // Revalidate membership after backgrounding; no poses until it succeeds.
    const g=generation,current=room,next=channel;if(!client||!current||!next)return;
    const stillCurrent=()=>g===generation&&revision===connectionRevision&&connected()&&!document.hidden;
    void (async()=>{
      try {
        const {error}=await client.rpc('renew_exploration_membership',{p_room_id:current.room_id,p_session_id:current.session_id});
        if(!stillCurrent())return;if(error)throw error;
        await refreshMembers(g);if(!stillCurrent())return;
        if(await next.track({session:current.session_id})!=='ok')throw new Error('PRESENCE_FAILED');
        if(stillCurrent())publisher?.setStatus('SUBSCRIBED');
      }catch(error){if(stillCurrent())void exit(connectionError(error));}
    })();
  }
  document.addEventListener('visibilitychange',visibility);
  return {update(dt:number,time:number){for(const peer of peers.values()){const predicted=predictPosition(peer.pose,performance.now()-peer.seen);peer.avatar.group.position.lerp(new THREE.Vector3(predicted.x,predicted.y,predicted.z),1-Math.exp(-dt*12));peer.avatar.updatePose(peer.pose.yaw,peer.pose.speed,22,peer.pose.state,dt,time);if(peer.pose.pose&&peer.pose.pose!=='natural'&&peer.pose.pose!=='none')peer.avatar.applyPhotoPose(peer.pose.pose,peer.pose.yaw);}},dispose(){disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visibility);void exit();panel.remove();}};
}
