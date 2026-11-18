import {useState} from 'react';
import {AVATARS,AVATAR_KEY,loadAvatar,type AvatarId} from './map/flight/avatarOptions';
import './avatarPicker.css';
export function AvatarPicker({en=false,onChange,value}:{en?:boolean;value?:AvatarId;onChange?:(id:AvatarId)=>void}){
 const [saved,setAvatar]=useState<AvatarId>(loadAvatar);const avatar=value??saved;
 return <fieldset className="avatar-picker"><legend>{en?'Choose your diver':'街へ出かけるキャラクター'}</legend><div className="avatar-picker-options">{AVATARS.map(a=><button key={a.id} type="button" aria-pressed={avatar===a.id} onClick={()=>{setAvatar(a.id);onChange?.(a.id);try{localStorage.setItem(AVATAR_KEY,a.id);}catch{}}}>
 <svg viewBox="0 0 100 110" width="64" height="70" aria-hidden="true"><path d="M35 68v28m30-28v28M25 61v22m50-22v22" stroke="#dfd5bd" strokeWidth="13" strokeLinecap="round"/><rect x="30" y="51" width="40" height="34" rx="14" fill="#dfd5bd"/>{a.id==='mendako'?<path d="M27 32L12 13q16-7 23 14m38 5 15-19q-16-7-23 14" fill="#ba7770"/>:a.id==='angler'?<path d="M50 20q-10-20-23-10" fill="none" stroke="#ebc079" strokeWidth="5"/>:null}<ellipse cx="50" cy="36" rx={a.id==='jellyfish'?32:28} ry="27" fill={a.id==='angler'?'#567a81':a.id==='jellyfish'?'#8f9dbd':'#ba7770'}/>{a.id==='angler'&&<circle cx="25" cy="11" r="6" fill="#f4df9f"/>}{a.id==='jellyfish'&&<path d="M18 47q8 18 16 0 8 18 16 0 8 18 16 0 8 18 16 0" fill="#8f9dbd"/>}<ellipse cx="50" cy="38" rx="20" ry="16" fill="#20373b" stroke="#f4d7a7" strokeWidth="3"/><circle cx="43" cy="38" r="2.5" fill="#f8eddf"/><circle cx="57" cy="38" r="2.5" fill="#f8eddf"/></svg>
 <span>{en?a.en:a.ja}</span><small>{avatar===a.id?(en?'Selected':'選択中'):' '}</small></button>)}</div></fieldset>;
}
