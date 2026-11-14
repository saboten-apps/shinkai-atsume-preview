import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../../config/appConfig';
import type { FishRecord } from '../../types/schema';
import { getFishDisplayName } from '../../lib/i18n';
import { dailyPlace, detector, HIDE_VERSION, loadDiscovery, saveDiscovery, START, type Discovery, type Position, type SearchMode } from './domain';
import Exploration2D from './Exploration2D';
import type { Search3DBridge } from './map/components/Map3DView';
import type { PerformanceStats } from './map/types';
import { makeDiscoveryCard } from './discoveryCard';
import './exploration.css';

class MapBoundary extends Component<{children: import('react').ReactNode; onFallback:()=>void; en:boolean}, {failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="search-notice"><p>{this.props.en?'3D could not load.':'3Dを読み込めませんでした。'}</p><button onClick={this.props.onFallback}>{this.props.en?'Continue in 2D':'2Dで続ける'}</button></div>:this.props.children;}
}
const Map3D = lazy(() => import('./map/components/Map3DView').then(m => ({default:m.Map3DView})));
const EMPTY_PINS: [] = [];
const NO_SELECT = () => {};
const DIRECTIONS = ['北','北東','東','南東','南','南西','西','北西'];
const DIRECTIONS_EN = ['N','NE','E','SE','S','SW','W','NW'];

export default function ExplorationPage(props: { locale: Locale; date: string; fish?: FishRecord; onBack: () => void }) {
  // Lock the day at entry; a midnight change never moves an ongoing hunt.
  const [session] = useState(() => ({date:props.date,fish:props.fish,place:dailyPlace(props.date)}));
  const {date,fish,place} = session;
  const en = props.locale === 'en';
  const [mode,setMode] = useState<SearchMode>('2d');
  const [started,setStarted] = useState(false);
  const [optionsOpen,setOptionsOpen] = useState(false);
  const [position,setPosition] = useState<Position>(START);
  const entryRef = useRef<Position>(START);
  const [visible,setVisible] = useState(false);
  const [found,setFound] = useState<Discovery|null>(()=>fish?loadDiscovery(date,fish.id,place.id):null);
  const [notice,setNotice] = useState('');
  const [stats,setStats] = useState<PerformanceStats|null>(null);
  const [sound,setSound] = useState(false);
  const audioRef = useRef<AudioContext|null>(null);
  const captureRef = useRef<(()=>string)|null>(null);
  const sceneRef = useRef<string|undefined>();
  const [card,setCard] = useState<{blob:Blob;url:string}|null>(null);
  const [busy,setBusy] = useState(false);
  const [slow,setSlow] = useState(false);
  const slowCount = useRef(0);
  const hint = detector(position,place);
  const hintRef = useRef(hint);hintRef.current = hint;
  const onPosition = useCallback((p:Position,canSee:boolean)=>{setPosition(p);setVisible(canSee);},[]);
  const onCaptureReady = useCallback((capture:(()=>string)|null)=>{captureRef.current=capture;},[]);
  const onStats = useCallback((value:PerformanceStats)=>{
    setStats(value);slowCount.current=value.fps<20?slowCount.current+1:0;
    if(slowCount.current>=25)setSlow(true);
  },[]);
  const onError = useCallback((reason:string)=>{setNotice(reason);setMode('2d');setVisible(true);},[]);
  const immersive = started && !found && mode === '3d';
  useEffect(() => {
    if (!immersive) return;
    document.body.classList.add('exploration-immersive');
    const chrome = Array.from(document.querySelectorAll<HTMLElement>('.app-header, .app-footer'));
    const previousInert = chrome.map(element => element.inert);
    chrome.forEach(element => { element.inert = true; });
    return () => {
      document.body.classList.remove('exploration-immersive');
      chrome.forEach((element, index) => { element.inert = previousInert[index]; });
      window.scrollTo(0, 0);
    };
  }, [immersive]);
  const bridge:Search3DBridge = {start:entryRef.current,target:place,onPosition,onCaptureReady};
  useEffect(()=>()=>{if(card)URL.revokeObjectURL(card.url);},[card]);
  useEffect(()=>{
    if(!sound || found)return;
    let timer:number;
    const tick=()=>{
      const ctx=audioRef.current;
      if(ctx?.state==='running' && document.visibilityState==='visible'){
        const oscillator=ctx.createOscillator(),gain=ctx.createGain();
        oscillator.frequency.value=hintRef.current.near?880:440;gain.gain.setValueAtTime(.045,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12);
        oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+.13);
      }
      timer=window.setTimeout(tick,Math.min(2200,Math.max(350,hintRef.current.distance*4)));
    };tick();return()=>clearTimeout(timer);
  },[sound,found]);
  useEffect(()=>()=>{void audioRef.current?.close();},[]);
  const switchMode=(next:SearchMode)=>{entryRef.current=position;setMode(next);setNotice('');setVisible(next==='2d');setSlow(false);slowCount.current=0;};
  const discover=()=>{
    if(!fish || !hint.near || (mode==='3d'&&!visible))return;
    const record:Discovery={date,fishId:fish.id,placeId:place.id,version:HIDE_VERSION,mode,foundAt:new Date().toISOString()};
    try{if(mode==='3d')sceneRef.current=captureRef.current?.();}catch{sceneRef.current=undefined;}
    setFound(record);setSound(false);
    if(!saveDiscovery(record))setNotice(en?'Found! This browser could not save your discovery.':'発見！ このブラウザでは発見記録を保存できませんでした。');
  };
  const generate=async()=>{
    if(!fish)return;setBusy(true);setNotice('');
    try{const blob=await makeDiscoveryCard(fish,date,place,props.locale,sceneRef.current);setCard({blob,url:URL.createObjectURL(blob)});}
    catch{setNotice(en?'Could not create the card. Check your connection and try again.':'カードを作成できませんでした。通信状態を確認して、もう一度お試しください。');}
    finally{setBusy(false);}
  };
  const text=fish?`${date} ${getFishDisplayName(fish,props.locale)} / ${en?place.nameEn:place.name} — ${en?'Found in virtual Numazu':'深海あつめ・バーチャル探索で発見'} #深海あつめ #うみまちラボ\n${new URL(import.meta.env.BASE_URL,location.href).href}`:'';
  const share=async()=>{
    if(!card)return;const file=new File([card.blob],`shinkai-discovery-${date}.png`,{type:'image/png'});
    try{
      if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],text});
      else{await navigator.clipboard.writeText(text);setNotice(en?'Text copied. Save the image and attach it to your post.':'共有文をコピーしました。画像を保存して投稿に添付してください。');}
    }catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))setNotice(en?'Use the text below and save the image.':'下の共有文と画像保存をご利用ください。');}
  };
  if(!fish)return <section className="page-container"><h2>{en?'Draw today’s fish first':'まず今日のガチャを引こう'}</h2><button className="primary-action-btn" onClick={props.onBack}>{en?'Back to Today':'今日へ戻る'}</button></section>;
  return <section className={`exploration-page ${immersive?'is-immersive':''}`}>
    <header className="search-heading"><div><p>{date} · {en?'VIRTUAL NUMAZU':'バーチャル沼津'}</p><h2>{en?'Find today’s fish':'今日の魚を探そう'}</h2></div><button onClick={props.onBack}>{en?'Back':'今日へ戻る'}</button></header>
    {!started&&!found?<div className="search-intro"><h3>{getFishDisplayName(fish,props.locale)}</h3><p>{en?'The same fish, in the same hiding place, for everyone today. Follow the detector through Numazu.':'今日の隠れ場所は、みんな同じ。探知機を頼りに沼津の街を探そう。'}</p><p>{en?place.hintEn:place.hint}</p><div className="search-actions"><button className="primary-action-btn" onClick={()=>{setMode('3d');setStarted(true);}}>{en?'Explore in 3D':'3Dの街で探す'}</button><button onClick={()=>{setMode('2d');setStarted(true);}}>{en?'Lightweight 2D map':'軽い2D地図で探す'}</button></div></div>:null}
    {started&&!found&&<>
      <div className="search-toolbar">
        {immersive&&<button onClick={props.onBack}>{en?'Back':'今日へ戻る'}</button>}
        <div><button aria-pressed={mode==='3d'} onClick={()=>switchMode('3d')}>3D</button><button aria-pressed={mode==='2d'} onClick={()=>switchMode('2d')}>2D</button></div>
        <button aria-expanded={optionsOpen} aria-controls="search-options" onClick={()=>setOptionsOpen(!optionsOpen)}>{en?'Guide':'案内・設定'}</button>
      </div>
      <div className={`search-detector ${hint.near?'is-near':''}`} aria-live="polite"><span style={{display:'inline-block',transform:`rotate(${hint.bearing}deg)`}} aria-hidden="true">↑</span><strong>{(en?DIRECTIONS_EN:DIRECTIONS)[hint.direction]} · {Math.round(hint.distance)}m</strong><span>{hint.near?(en?'Fish nearby!':'すぐ近くに反応！'):en?place.hintEn:place.hint}</span></div>
      <div id="search-options" className="search-options" role="region" aria-label={en?'Guide and settings':'操作案内・設定'} hidden={!optionsOpen}>
        <div className="search-options-heading"><strong>{en?'Guide & settings':'操作案内・設定'}</strong><button onClick={()=>setOptionsOpen(false)}>{en?'Close':'閉じる'}</button></div>
        <p className="search-help">{mode==='3d'?(en?'Map: drag with two fingers to move the center. Flight: use the left stick to move, drag to look around, or tap a destination to fly. Approach the glowing marker at the same height.':'地図：2本指で中心を移動。飛行：左スティックで移動、ドラッグで見回し、タップした場所へ自動飛行。光るマーカーと同じ高さへ近づこう。'):(en?'Tap the map to move the orange search marker.':'地図をタップしてオレンジ色の探索マーカーを移動します。')}</p>
        <p>{en?place.hintEn:place.hint}</p>
        <button aria-pressed={sound} onClick={async()=>{if(!sound){try{audioRef.current??=new AudioContext();await audioRef.current.resume();}catch{setNotice(en?'Sound unavailable':'音を使えませんでした');return;}}setSound(!sound);}}>{en?'Sound':'探知音'} {sound?'ON':'OFF'}</button>
      {slow&&mode==='3d'&&<div role="status">{en?'3D is running slowly. Your search can continue in 2D.':'3Dの動作が重いようです。同じ場所から2Dで続けられます。'} <button onClick={()=>switchMode('2d')}>{en?'Continue in 2D':'2Dで続ける'}</button></div>}
      {stats&&mode==='3d'&&<details><summary>{en?'Performance':'動作情報'} · {stats.fps} FPS</summary><p>DPR {stats.dpr} · {stats.drawCalls} draws · {stats.geometries} geometries · {stats.textures} textures</p><p>Frame p50 {stats.frameP50Ms?.toFixed(1)} ms · p95 {stats.frameP95Ms?.toFixed(1)} ms ({en?'recent 300 frames':'直近300フレーム'})</p><button onClick={()=>{
        const blob=new Blob([JSON.stringify({capturedAt:new Date().toISOString(),mode,position,stats,userAgent:navigator.userAgent,viewport:{width:innerWidth,height:innerHeight},visibility:document.visibilityState},null,2)],{type:'application/json'});
        const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='shinkai-performance.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }}>{en?'Save performance snapshot':'動作情報を保存'}</button></details>}
        <p className="search-options-credit">{en?'Source: MLIT PLATEAU, Numazu 2021. Modified for virtual exploration; not survey-accurate.':'出典：国土交通省 PLATEAU 沼津市（2021年度）を加工。バーチャル探索用の表現で、正確な測量図ではありません。'} <a href="https://www.geospatial.jp/ckan/dataset/plateau-22203-numazu-shi-2021" target="_blank" rel="noreferrer">PLATEAU</a></p>
      </div>
      <div className="search-map">{mode==='3d'?<MapBoundary en={en} onFallback={()=>switchMode('2d')}><Suspense fallback={<p>{en?'Loading 3D…':'3Dを読み込んでいます…'}</p>}><Map3D pins={EMPTY_PINS} selectedPinId={null} onSelectPin={NO_SELECT} onUpdateStats={onStats} onWebGLError={onError} search={bridge}/></Suspense><span className="search-center" aria-hidden="true">＋</span></MapBoundary>:<Exploration2D en={en} position={position} onMove={setPosition}/>}</div>
      <div className="search-actions search-discover"><button className="primary-action-btn" disabled={!hint.near||(mode==='3d'&&!visible)} onClick={discover}>{hint.near?(en?'Discover the fish!':'魚を発見する！'):(en?'Follow the detector':'探知機を頼りに近づこう')}</button>{immersive&&(slow?<button className="search-low-fps" onClick={()=>switchMode('2d')}>{en?'Lighter 2D':'軽い2Dへ'}</button>:<small>PLATEAU · 2021</small>)}</div>
    </>}
    {found&&<div className="search-found"><p className="search-found-label">{en?'DISCOVERED':'発見！'}</p><h2>{getFishDisplayName(fish,props.locale)}</h2><p>{en?place.nameEn:place.name} · {date}</p><p>{en?'A discovery in virtual Numazu. Make a postcard with the scenery.':'バーチャルの沼津で出会いました。街の景色と一緒にカードにしよう。'}</p><button className="primary-action-btn" disabled={busy} onClick={generate}>{busy?(en?'Creating…':'カードを作成中…'):en?'Create discovery card':'景色入りカードを作る'}</button>{card&&<><img className="discovery-card-preview" src={card.url} alt={en?'Discovery postcard':'発見カード'}/><div className="search-actions"><a className="primary-action-btn" download={`shinkai-discovery-${date}.png`} href={card.url}>{en?'Save image':'画像を保存'}</a><button onClick={share}>{en?'Share / copy text':'共有・共有文をコピー'}</button></div><textarea readOnly aria-label={en?'Share text':'共有文'} value={text}/></>}</div>}
    {notice&&<p role="status" className="search-notice">{notice}</p>}
    <footer className="search-credit"><p>{en?'Virtual exploration. No real-world visit is recorded.':'バーチャルでの探索です。実際の来店記録は作りません。'}</p><p>{en?'Source: MLIT Project PLATEAU, Numazu 2021. Modified for this game; not survey-accurate.':'出典：国土交通省 PLATEAU 沼津市（2021年度）を加工。形状・位置はゲーム用の表現であり、正確な測量図ではありません。'}</p><a href="https://www.geospatial.jp/ckan/dataset/plateau-22203-numazu-shi-2021" target="_blank" rel="noreferrer">PLATEAU</a></footer>
  </section>;
}
