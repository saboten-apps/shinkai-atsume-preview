import {useState} from 'react';
import type {BuildingRecord} from '../exploration/map/three/buildingSelection';
import {DRAFT_KEY,parseDrafts,serializeDrafts,validateDraft,type PlaceDraft} from './placeDraft';
import {placeForBuilding} from './places';
export default function PlaceDraftEditor({building}:{building:BuildingRecord}){
 const [notice,setNotice]=useState(''),[problem]=useState(()=>{try{const s=localStorage.getItem(DRAFT_KEY);if(s)parseDrafts(s);return '';}catch{return '保存済みの下書きを読み込めません。書き出し済みファイルを確認してください。';}});
 const [draft,setDraft]=useState<PlaceDraft>(()=>{
  try{const s=localStorage.getItem(DRAFT_KEY);const saved=s&&parseDrafts(s).find(d=>d.buildingId===building.id);if(saved)return saved;}catch{/* Leave stored data intact. */}
  const p=placeForBuilding(building.id);
  return {id:p?.id??`place-${crypto.randomUUID()}`,buildingId:building.id,x:building.center[0],z:building.center[2],name:p?.ja??'',description:p?.descriptionJa??'',url:p?.url??'',photo:p?.photo??'',photographer:'',permission:'',credit:p?.credit??''};
 });
 function save(){const d=validateDraft(draft);const current=localStorage.getItem(DRAFT_KEY);const all=current?parseDrafts(current):[];const others=all.filter(p=>p.buildingId!==d.buildingId);if(others.some(p=>p.id===d.id))throw Error('場所IDが別の建物と重複しています');if(others.length>=200)throw Error('下書きは200件までです');localStorage.setItem(DRAFT_KEY,serializeDrafts([...others,d]));return d;}
 const act=(fn:()=>void)=>{try{fn();}catch(error){setNotice(error instanceof Error?error.message:'保存できませんでした。');}};
 const fields:[keyof PlaceDraft,string][]=[['name','建物・場所の名前'],['description','紹介文'],['url','関連URL'],['photo','公開する写真のパス'],['photographer','写真の提供者・撮影者'],['permission','公開・加工の利用許可の記録'],['credit','表示するクレジット'],['id','場所ID（公開後は変更しない）']];
 return <section className="place-draft-editor" onKeyDown={e=>e.stopPropagation()}>
 <p>この端末の下書きです。保存や書き出しだけでは公開されません。</p>
 <p>選択建物：<code>{building.id}</code><br/>{building.lat.toFixed(6)}, {building.lon.toFixed(6)}</p>
 {problem&&<p role="alert">{problem}</p>}
 {fields.map(([key,label])=><div key={key}><label htmlFor={`place-draft-${key}`}>{label}</label>{key==='description'||key==='permission'?<textarea id={`place-draft-${key}`} value={String(draft[key])} maxLength={key==='description'?2000:1000} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>:<input id={`place-draft-${key}`} value={String(draft[key])} maxLength={key==='name'?100:key==='url'?1000:key==='photo'?300:key==='id'?80:200} onChange={e=>setDraft({...draft,[key]:e.target.value})}/>}</div>)}
 <small>写真ファイルは別途受け取り、公開時に配置します。例：environment/places/my-place.webp。人物の連絡先など非公開情報は入力しないでください。</small>
 <div className="place-actions"><button onClick={()=>act(()=>{save();setNotice('この端末に下書きを保存しました。');})}>下書きを保存</button>
 <button onClick={()=>act(()=>{save();const blob=new Blob([localStorage.getItem(DRAFT_KEY)!],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='shinkai-place-drafts.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('保存済みの全下書きを書き出しました。写真ファイルは別途用意してください。');})}>保存して書き出す</button></div>
 <label>下書きファイルを復元・追加<input type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>1000000)throw Error('ファイルが大きすぎます');const incoming=parseDrafts(await file.text());const raw=localStorage.getItem(DRAFT_KEY);const current=raw?parseDrafts(raw):[];for(const d of incoming){const existing=current.find(p=>p.id===d.id||p.buildingId===d.buildingId);if(existing&&JSON.stringify(existing)!==JSON.stringify(d))throw Error('既存の下書きと競合しています。別の端末で確認してください。');if(!existing)current.push(d);}if(current.length>200)throw Error('下書きは200件までです');localStorage.setItem(DRAFT_KEY,serializeDrafts(current));const selected=current.find(d=>d.buildingId===building.id);if(selected)setDraft(selected);setNotice('下書きを復元しました。');}catch(error){setNotice(error instanceof Error?error.message:'復元できませんでした');}e.target.value='';}}/></label>
 <details><summary>入力中の紹介を確認</summary><h3>{draft.name}</h3><p>{draft.description}</p><small>{draft.credit}</small></details>
 {notice&&<p role="status">{notice}</p>}
 </section>;
}
