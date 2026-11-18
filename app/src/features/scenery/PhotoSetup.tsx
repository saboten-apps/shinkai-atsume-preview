import {useEffect,useRef} from 'react';
import {PHOTO_POSES,type PhotoPose} from '../exploration/map/flight/avatarOptions';
export function PhotoSetup({en,pose,canPose,onPose,onCapture,onClose}:{en:boolean;pose:PhotoPose;canPose:boolean;onPose:(pose:PhotoPose)=>void;onCapture:()=>void;onClose:()=>void}){
 const root=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,changed:Array<[HTMLElement,boolean]>=[];
  const boundary=root.current?.closest('.exploration-page')??root.current?.closest('.search-world');
  let current:HTMLElement|null=root.current;
  while(current&&current!==boundary){const parent=current.parentElement;if(!parent)break;for(const sibling of Array.from(parent.children))if(sibling!==current&&sibling instanceof HTMLElement){changed.push([sibling,sibling.inert]);sibling.inert=true;}current=parent;}
  root.current?.querySelector('select')?.focus();
  return()=>{for(const [element,inert]of changed)element.inert=inert;previous?.focus();};
 },[]);
 return <div ref={root} className="avatar-photo-controls" role="dialog" aria-modal="true" aria-label={en?'Photo setup':'撮影の準備'} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{
  e.stopPropagation();if(e.key==='Escape')onClose();
  if(e.key==='Tab'){const controls=Array.from(root.current?.querySelectorAll<HTMLElement>('select,button')??[]),first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>
  <label>{en?'Photo pose':'撮影ポーズ'}<select value={canPose?pose:'none'} onChange={e=>onPose(e.target.value as PhotoPose)}>{PHOTO_POSES.map(p=><option value={p.id} key={p.id} disabled={!canPose&&p.id!=='none'}>{en?p.en:p.ja}</option>)}</select></label>
  <p>{canPose?(en?'Your diver faces the camera. Movement is paused.':'カメラに向かってポーズ。移動は一時停止します。'):(en?'Start flying to include your diver in the photo.':'キャラと撮るには、いったん閉じて「飛ぶ」を選んでください。')}</p>
  <div><button onClick={onClose}>{en?'Cancel':'撮影をやめる'}</button><button className="primary-action-btn" onClick={onCapture}>{en?'Take this photo':'この構図で撮る'}</button></div>
 </div>;
}
