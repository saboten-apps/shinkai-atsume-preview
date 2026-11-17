import {useEffect,useState} from 'react';
import './fishing.css';
export function FishingSequence({en,onFinish}:{en:boolean;onFinish:()=>void}){
  const [bite,setBite]=useState(false);
  useEffect(()=>{const id=window.setTimeout(()=>setBite(true),5500);return()=>clearTimeout(id);},[]);
  return <div className={`fishing-sequence ${bite?'has-bite':''}`} role="dialog" aria-modal="true" aria-label={en?'Deep sea fishing':'深海で魚を釣る'}>
    <div className="fishing-surface"/>
    <svg className="fishing-rod" viewBox="0 0 300 140" aria-hidden="true"><path d="M15 135 Q90 5 150 5" fill="none" stroke="#ff984d" strokeWidth="7"/><path d="M150 5V140" stroke="#e1f9ff" strokeWidth="1"/><circle cx="35" cy="100" r="16" fill="#063957" stroke="#ff984d" strokeWidth="5"/></svg><div className="fishing-line"><span>J</span></div>
    {Array.from({length:12},(_,i)=><i className="fishing-bubble" key={i} style={{left:`${(i*29)%100}%`,animationDelay:`${i*.3}s`}}/>)}
    <div className="fishing-shadow" aria-hidden="true"></div>
    <div className="fishing-caption" aria-live="polite"><small>UMIMACHI LAB · NUMAZU</small><h2>{bite?(en?'Something took the bait!':'何かが、かかった！'):(en?'Following the line into the deep…':'糸をたどって、深海へ。')}</h2><p>{bite?(en?'What will you catch today?':'今日は、どんな魚に出会える？'):(en?'A small light waits in the darkness.':'光の届かない海に、小さな気配。')}</p>{bite&&<button autoFocus className="primary-action-btn" onClick={onFinish}>{en?'Reel it in!':'引き上げる！'}</button>}</div>
    <button className="fishing-skip" onClick={onFinish}>{en?'Skip to result':'演出をスキップ'}</button>
  </div>;
}
