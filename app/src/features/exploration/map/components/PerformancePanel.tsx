import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
import type {PerformanceStats} from '../types';
export function captureTiming(samples:PerformanceStats[],actualElapsedMs:number|null=null){
 const intervals=samples.slice(1).map((s,i)=>({ms:(s.elapsedMs??0)-(samples[i].elapsedMs??0),frames:s.frames!==undefined&&samples[i].frames!==undefined?s.frames-samples[i].frames!:undefined}));
 const positive=intervals.filter(i=>i.ms>0),span=samples.length>1?(samples[samples.length-1]!.elapsedMs??0)-(samples[0].elapsedMs??0):0;
 const gaps=positive.map(i=>i.ms),rates=positive.filter(i=>i.frames!==undefined&&i.frames>=0).map(i=>i.frames!*1000/i.ms);
 const issues:string[]=[];if(actualElapsedMs!==null&&actualElapsedMs>35000)issues.push('extended-duration');if(samples.length<10||span<15000)issues.push('few-samples');if(gaps.some(g=>g>3000))issues.push('long-sample-gap');if(intervals.some(i=>i.ms<0||(i.frames??0)<0))issues.push('scene-restarted');
 return{targetMs:30000,actualElapsedMs,sampleSpanMs:span,maxSampleGapMs:gaps.length?Math.max(...gaps):0,worstIntervalFps:rates.length?Math.min(...rates):null,issues};
}
/** Exact average from the frame counter, with the worst values seen during the capture. */
export function summarize(samples:PerformanceStats[]){
  const first=samples[0],last=samples[samples.length-1],timing=captureTiming(samples);
  const counted=samples.length>1&&first.frames!==undefined&&last.frames!==undefined&&first.elapsedMs!==undefined&&last.elapsedMs!==undefined&&last.elapsedMs>first.elapsedMs&&!timing.issues.includes('scene-restarted');
  const max=(pick:(s:PerformanceStats)=>number|undefined)=>{const values=samples.map(pick).filter((v):v is number=>typeof v==='number');return values.length?Math.max(...values):undefined;};
  return {
    sampleSpanMs:timing.sampleSpanMs,maxSampleGapMs:timing.maxSampleGapMs,worstIntervalFps:timing.worstIntervalFps,
    averageFps:counted?(last.frames!-first.frames!)*1000/(last.elapsedMs!-first.elapsedMs!):samples.reduce((sum,s)=>sum+s.fps,0)/Math.max(1,samples.length),
    averageFpsSource:counted?'frame counter':'mean of per-second readings',
    minFps:samples.length?Math.min(...samples.map(s=>s.fps)):0,
    rafP95MsMax:max(s=>s.rafP95Ms),updateMsAvgMax:max(s=>s.updateMsAvg),renderMsAvgMax:max(s=>s.renderMsAvg),renderMsMax:max(s=>s.renderMsMax),
    dprMin:samples.length?Math.min(...samples.map(s=>s.dpr)):0,dprMax:samples.length?Math.max(...samples.map(s=>s.dpr)):0,
    dprChanges:(last?.dprChanges??0)-(first?.dprChanges??0),
    jsHeapMBMax:max(s=>s.jsHeapMB),
  };
}
export function PerformancePanel({stats,en,context}:{stats:PerformanceStats|null;en:boolean;context:string}){
  const [recording,setRecording]=useState(false),[result,setResult]=useState<PerformanceStats[]>([]),[notice,setNotice]=useState('');
  const samples=useRef<PerformanceStats[]>([]),startedAt=useRef(0),latest=useRef(stats);latest.current=stats;
  const [elapsed,setElapsed]=useState(0),[timing,setTiming]=useState<ReturnType<typeof captureTiming>|null>(null);
  useEffect(()=>{if(recording&&stats&&document.visibilityState==='visible')samples.current.push({...stats});},[recording,stats]);
  useEffect(()=>{
    if(!recording)return;
    const finish=()=>{const final=latest.current;if(final&&final.frames!==samples.current[samples.current.length-1]?.frames)samples.current.push({...final});const captured=[...samples.current];setTiming(captureTiming(captured,performance.now()-startedAt.current));setResult(captured);setRecording(false);};
    const timer=setTimeout(finish,Math.max(0,30000-(performance.now()-startedAt.current)));
    const ticker=setInterval(()=>setElapsed(Math.min(30,Math.floor((performance.now()-startedAt.current)/1000))),1000);
    const visibility=()=>{if(document.hidden){setRecording(false);setResult([]);setTiming(null);setNotice(en?'Measurement cancelled because the page was hidden.':'画面が非表示になったため測定を中止しました。');}};
    document.addEventListener('visibilitychange',visibility);
    return()=>{clearTimeout(timer);clearInterval(ticker);document.removeEventListener('visibilitychange',visibility);};
  },[recording,en]);
  if(!stats)return null;
  const save=()=>{
    const samples=result.length?result:[stats];
    const blob=new Blob([JSON.stringify({schema:2,capturedAt:new Date().toISOString(),build:typeof __APP_BUILD__==='undefined'?null:__APP_BUILD__,context,userAgent:navigator.userAgent,
      viewport:{width:innerWidth,height:innerHeight},deviceDpr:devicePixelRatio,screen:{width:screen.width,height:screen.height},
      hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGB:(navigator as Navigator&{deviceMemory?:number}).deviceMemory,
      gpu:stats.gpu,capture:result.length?timing:{kind:'snapshot'},summary:summarize(samples),samples},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='shinkai-performance.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const summary=result.length?summarize(result):null;
  return <>{recording&&createPortal(<div className="performance-recording-badge" role="status" aria-live="off">{en?'Recording performance':'動作記録中'} · {elapsed} / 30 {en?'s':'秒'}</div>,document.body)}<details className="performance-panel"><summary>{en?'Performance':'動作情報'} · {stats.fps} FPS</summary>
    <p>{en?'Target':'描画上限'} {stats.renderTargetFps??60} FPS · DPR {stats.dpr.toFixed(2)} · {stats.drawCalls} draws · {stats.triangles.toLocaleString()} triangles</p>
    <p>{stats.geometries} geometries · {stats.textures} textures · Frame p50 {stats.frameP50Ms?.toFixed(1)} ms / p95 {stats.frameP95Ms?.toFixed(1)} ms</p>
    {stats.renderMsAvg!==undefined&&<p>{en?'Per frame':'1フレームの処理'}: {en?'update':'更新'} {stats.updateMsAvg?.toFixed(1)} ms · {en?'draw':'描画'} {stats.renderMsAvg.toFixed(1)} ms ({en?'max':'最大'} {stats.renderMsMax?.toFixed(1)} ms) · {en?'display':'画面'} {stats.rafP50Ms?Math.round(1000/stats.rafP50Ms):'–'} Hz</p>}
    <p>{en?'A still map renders at up to 30 FPS; flight and camera movement at up to 60 FPS. Resolution adjusts under sustained load.':'地図の静止中は最大30 FPS、飛行・視点移動中は最大60 FPS。負荷が続くと描画解像度を自動調整します。'}</p>
    <button disabled={recording} onClick={()=>{samples.current=[];startedAt.current=performance.now();setElapsed(0);setTiming(null);setResult([]);setNotice('');setRecording(true);}}>{recording?(en?'Measuring for 30 seconds…':'30秒測定中…'):(en?'Measure for 30 seconds':'30秒測定する')}</button>
    <button disabled={recording} onClick={save}>{en?'Save performance data':'動作情報を保存'}</button>
    {summary&&<p role="status">{en?'Measurement complete':'測定完了'} · {result.length} {en?'samples':'サンプル'} · {en?'Average':'平均'} {summary.averageFps.toFixed(1)} FPS</p>}
    {timing&&timing.issues.length>0&&<p role="status">{en?'The recording contains long pauses or too few samples. Save it to help investigate the slowdown.':'長い停止や記録の不足がありました。原因確認のため、このデータを保存できます。'}</p>}
    {timing&&<p>{en?'Actual recording time':'実際の記録時間'} {((timing.actualElapsedMs??0)/1000).toFixed(1)} {en?'s':'秒'} · {en?'Largest gap':'最長の記録間隔'} {(timing.maxSampleGapMs/1000).toFixed(1)} {en?'s':'秒'}</p>}
    {notice&&<p role="status">{notice}</p>}
  </details></>;
}
