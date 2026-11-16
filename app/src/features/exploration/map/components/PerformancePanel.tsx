import {useEffect,useRef,useState} from 'react';
import type {PerformanceStats} from '../types';
export function PerformancePanel({stats,en,context}:{stats:PerformanceStats|null;en:boolean;context:string}){
  const [recording,setRecording]=useState(false),[result,setResult]=useState<PerformanceStats[]>([]),[notice,setNotice]=useState('');
  const samples=useRef<PerformanceStats[]>([]);
  useEffect(()=>{if(recording&&stats&&document.visibilityState==='visible')samples.current.push({...stats});},[recording,stats]);
  useEffect(()=>{
    if(!recording)return;
    const finish=()=>{setResult([...samples.current]);setRecording(false);};
    const timer=setTimeout(finish,30000);
    const visibility=()=>{if(document.hidden){setRecording(false);setResult([]);setNotice(en?'Measurement cancelled because the page was hidden.':'画面が非表示になったため測定を中止しました。');}};
    document.addEventListener('visibilitychange',visibility);
    return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[recording,en]);
  if(!stats)return null;
  const save=()=>{
    const blob=new Blob([JSON.stringify({capturedAt:new Date().toISOString(),context,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},deviceDpr:devicePixelRatio,samples:result.length?result:[stats]},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='shinkai-performance.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <details className="performance-panel"><summary>{en?'Performance':'動作情報'} · {stats.fps} FPS</summary>
    <p>{en?'Target':'描画上限'} {stats.renderTargetFps??60} FPS · DPR {stats.dpr.toFixed(2)} · {stats.drawCalls} draws · {stats.triangles.toLocaleString()} triangles</p>
    <p>{stats.geometries} geometries · {stats.textures} textures · Frame p50 {stats.frameP50Ms?.toFixed(1)} ms / p95 {stats.frameP95Ms?.toFixed(1)} ms</p>
    <p>{en?'A still map renders at up to 30 FPS; flight and camera movement at up to 60 FPS. Resolution adjusts under sustained load.':'地図の静止中は最大30 FPS、飛行・視点移動中は最大60 FPS。負荷が続くと描画解像度を自動調整します。'}</p>
    <button disabled={recording} onClick={()=>{samples.current=[];setResult([]);setNotice('');setRecording(true);}}>{recording?(en?'Measuring for 30 seconds…':'30秒測定中…'):(en?'Measure for 30 seconds':'30秒測定する')}</button>
    <button disabled={recording} onClick={save}>{en?'Save performance data':'動作情報を保存'}</button>
    {result.length>0&&<p role="status">{en?'Measurement complete':'測定完了'} · {result.length} {en?'samples':'サンプル'} · {en?'Average':'平均'} {(result.reduce((sum,s)=>sum+s.fps,0)/result.length).toFixed(1)} FPS</p>}
    {notice&&<p role="status">{notice}</p>}
  </details>;
}
