import {useState} from 'react';
import type {FishRecord,CollectionState} from '../../types/schema';
import type {Locale} from '../../config/appConfig';
import {getFishVisual,getShapeSvgPaths} from '../../data/fishPlaceholders';
import {getFishDisplayName} from '../../lib/i18n';
import {FishIllustration} from '../../components/FishIllustration';
import './aquarium.css';
export default function AquariumPage({fishList,collectionState,locale}:{fishList:readonly FishRecord[];collectionState:CollectionState;locale:Locale}){
 const en=locale==='en',owned=fishList.filter(f=>!!collectionState.obtainedFish[f.id]),[selected,setSelected]=useState<string|null>(null);
 const fish=owned.find(f=>f.id===selected)??owned[0];
 return <section className="page-container aquarium-page"><header><h2>{en?'Your little aquarium':'あつめた魚の小さな水族館'}</h2><p>{en?'Fish you met in the daily draw swim here. Select one to learn more.':'ガチャで出会った魚たちが泳ぎます。魚を選んで観察しよう。'}</p><a href="#/pokedex">{en?'Back to the catalog':'図鑑へ戻る'}</a></header>
 <svg className="aquarium-tank" viewBox="0 0 900 460" role="group" aria-label={en?'Swimming collected fish':'集めた魚が泳ぐ水槽'}>
 <defs><linearGradient id="aquarium-water" x2="0" y2="1"><stop stopColor="#22647c"/><stop offset="1" stopColor="#071d32"/></linearGradient></defs><rect width="900" height="460" rx="20" fill="url(#aquarium-water)"/>
 {owned.map((f,i)=>{const v=getFishVisual(f.id),p=getShapeSvgPaths(v.shape);return <g key={f.id} transform={`translate(${100+i%4*210} ${45+Math.floor(i/4)*70})`}><g className="aquarium-swimmer" style={{animationDuration:`${8+i%5}s`,animationDelay:`-${i*.9}s`}} role="button" tabIndex={0} aria-label={getFishDisplayName(f,locale)} aria-pressed={fish?.id===f.id} onClick={()=>setSelected(f.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelected(f.id);}}}><g transform="translate(-65 -28) scale(.55)"><path d={p.bodyPath} fill={v.accentColor} stroke={fish?.id===f.id?'#ffe6a9':'#c6e8e3'} strokeWidth={fish?.id===f.id?5:2}/><path d={p.detailPath} fill="none" stroke="#f5f0e6" strokeWidth="2"/><circle cx={p.eyePos.cx} cy={p.eyePos.cy} r="4" fill="#102534"/></g></g></g>;})}
 {!owned.length&&<text x="450" y="235" textAnchor="middle" fill="#e8f2ee" fontSize="24">{en?'Meet your first fish in the daily draw.':'今日のガチャで、最初の1匹に出会おう。'}</text>}
 </svg>
 {!!owned.length&&<label>{en?'Observe a fish':'観察する魚'} <select aria-label={en?'Observe a fish':'観察する魚'} value={fish?.id} onChange={e=>setSelected(e.target.value)}>{owned.map(f=><option value={f.id} key={f.id}>{getFishDisplayName(f,locale)}</option>)}</select></label>}
 {fish?<article className="aquarium-observation" aria-live="polite"><FishIllustration fishId={fish.id} illustration={fish.illustration} altText={getFishDisplayName(fish,locale)} isObtained size="sm"/><div><h3>{getFishDisplayName(fish,locale)}</h3><p>{fish.depth_text}</p><p>{fish.fact}</p><p>{fish.eat_or_display_note}</p><a href={`#/fish/${fish.id}`}>{en?'Read the full entry and sources':'詳しい説明と出典を見る'}</a></div></article>:<a className="primary-action-btn" href="#/today">{en?'Meet today’s fish':'今日の魚に会いに行く'}</a>}
 <p className="aquarium-note">{en?'Stylized illustrations. The tank and swimming motions are game representations, not a recreation of natural habitats.':'水槽・泳ぎ方・魚の大きさはゲーム用の表現です。実際の生息環境の再現ではありません。'}</p></section>;
}
