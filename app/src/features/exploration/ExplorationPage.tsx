import {PerformancePanel} from './map/components/PerformancePanel';
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '../../config/appConfig';
import type { FishRecord } from '../../types/schema';
import { getFishDisplayName } from '../../lib/i18n';
import { dailyPlace, detector, saveDiscovery, START, type Discovery, type Position, type SearchMode } from './domain';
import MapDownload from './MapDownload';
import Exploration2D from './Exploration2D';
import { fishWorldSession } from './fishWorld';
import { ExplorationLoading } from '../../components/ExplorationLoading';
import type { Search3DBridge } from './map/components/Map3DView';
import type { PerformanceStats } from './map/types';
import { makeDiscoveryCard } from './discoveryCard';
import './exploration.css';

class MapBoundary extends Component<{children: import('react').ReactNode; onFallback:()=>void; en:boolean}, {failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onFallback();}
  render(){return this.state.failed?<div className="search-notice"><p>{this.props.en?'3D could not load.':'3Dを読み込めませんでした。'}</p><button onClick={this.props.onFallback}>{this.props.en?'Continue in 2D':'2Dで続ける'}</button></div>:this.props.children;}
}
const Map3D = lazy(() => import('./map/components/Map3DView').then(m => ({default:m.Map3DView})));
const EMPTY_PINS: [] = [];
const NO_SELECT = () => {};
const DIRECTIONS = ['北','北東','東','南東','南','南西','西','北西'];
const DIRECTIONS_EN = ['N','NE','E','SE','S','SW','W','NW'];

export default function ExplorationPage(props: { locale: Locale; date: string; fish?: FishRecord; initialMode?:SearchMode; onBack: () => void }) {
  // Lock the day at entry; a midnight change never moves an ongoing hunt.
  const [session] = useState(() => ({date:props.date,fish:props.fish,...(props.fish?fishWorldSession(props.date,props.fish.id):{place:dailyPlace(props.date),version:'hide-v1',found:null})}));
  const {date,fish,place,version} = session;
  const en = props.locale === 'en';
  const [mode,setMode] = useState<SearchMode>(props.initialMode??'3d');
  const autoFly=useRef((props.initialMode??'3d')==='3d');
  const [sceneReady,setSceneReady]=useState(false);
  const onSceneReady=useCallback(()=>{setSceneReady(true);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.search-flight-button')?.focus({preventScroll:true}));},[]);
  const [optionsOpen,setOptionsOpen] = useState(false);
  const [found,setFound] = useState<Discovery|null>(()=>session.found);
  const [showingCard,setShowingCard]=useState(()=>!!found);
  const [position,setPosition] = useState<Position>(()=>found?{x:place.x,z:place.z}:START);
  const entryRef = useRef<Position>(position);
  const [visible,setVisible] = useState(false);
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
    if(slowCount.current>=5)setSlow(true);
  },[]);
  const onError = useCallback((reason:string)=>{setNotice(reason);setMode('2d');setVisible(true);},[]);
  const immersive = !!fish && !showingCard && mode === '3d';
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
  const bridge:Search3DBridge = {start:entryRef.current,target:place,fishId:fish?.id,locale:props.locale,onPosition,onCaptureReady,onReady:onSceneReady,autoFly:autoFly.current,discovered:!!found};
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
  const switchMode=(next:SearchMode)=>{if(next===mode)return;entryRef.current=position;autoFly.current=false;setSceneReady(false);setMode(next);setNotice('');setVisible(next==='2d');setSlow(false);slowCount.current=0;};
  const resume=(next:SearchMode)=>{
    entryRef.current=position;autoFly.current=next==='3d';setMode(next);setSceneReady(false);
    setOptionsOpen(false);setNotice('');setSlow(false);slowCount.current=0;setShowingCard(false);
  };
  const openCard=()=>{setSound(false);setOptionsOpen(false);setShowingCard(true);};
  const discover=()=>{
    if(found||!fish || !hint.near || (mode==='3d'&&!visible))return;
    const record:Discovery={date,fishId:fish.id,placeId:place.id,version,mode,foundAt:new Date().toISOString()};
    try{if(mode==='3d')sceneRef.current=captureRef.current?.();}catch{sceneRef.current=undefined;}
    setFound(record);setShowingCard(true);setSound(false);
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
    {!showingCard&&<>
      <div className="search-toolbar">
        {immersive&&<button onClick={props.onBack}>{en?'Back':'今日へ戻る'}</button>}
        <div><button aria-pressed={mode==='3d'} onClick={()=>switchMode('3d')}>3D</button><button aria-pressed={mode==='2d'} onClick={()=>switchMode('2d')}>2D</button></div>
        <button aria-expanded={optionsOpen} aria-controls="search-options" onClick={()=>setOptionsOpen(!optionsOpen)}>{en?'Guide':'案内・設定'}</button>
      </div>
      {found?<div className="search-detector"><strong>{en?'Found':'発見済み'}</strong><span>{en?'Enjoy exploring Numazu. Your discovery card is saved below.':'沼津の街を自由に散策しよう。発見カードはいつでも開けます。'}</span></div>:<div className={`search-detector ${hint.near?'is-near':''}`} aria-live="polite"><span style={{display:'inline-block',transform:`rotate(${hint.bearing}deg)`}} aria-hidden="true">↑</span><strong>{(en?DIRECTIONS_EN:DIRECTIONS)[hint.direction]} · {Math.round(hint.distance)}m</strong><span>{place.medium&&place.medium!=='air'?`${en?'Dive':'潜って探そう'} · ${en?'Depth':'水深'} ${(41.5-(place.y??41.5)).toFixed(1)}m`:hint.near?(en?'Fish nearby!':'すぐ近くに反応！'):en?place.hintEn:place.hint}</span></div>}
      <div id="search-options" className="search-options" role="region" aria-label={en?'Guide and settings':'操作案内・設定'} hidden={!optionsOpen}>
        <div className="search-options-heading"><strong>{en?'Guide & settings':'操作案内・設定'}</strong><button onClick={()=>setOptionsOpen(false)}>{en?'Close':'閉じる'}</button></div>
        <p className="search-help">{mode==='3d'?(en?'Building heights are emphasized 1.3× and bridges are approximate models aligned with the map. Fish placements and depths are fictional. Dive to find underwater fish; only today’s fish glows nearby. Map: drag with two fingers to move the center. Flight: use the left stick to move, drag to look around, or tap a destination to fly. Landing switches to walking; use Rise to fly again. Approach the glowing fish. Press and hold a building to inspect it.':'建物の高さは見やすさのため1.3倍に強調し、橋は位置を地図に合わせた簡易モデルです。魚はゲーム上の配置で、実際の生息地や水深とは異なります。海・川の魚は水面から潜って探せます。今日の魚だけ近づくほど光ります。地図：2本指で中心を移動。飛行：左スティックで移動、ドラッグで見回し、タップした場所へ自動飛行。着地すると歩行に切り替わり、「飛び立つ」で再び飛べます。光る魚に近づこう。建物を長押しすると情報を確認できます。'):(en?'Tap the map to move the orange search marker.':'地図をタップしてオレンジ色の探索マーカーを移動します。')}</p>
        <p>{en?place.hintEn:place.hint}</p>
        <button aria-pressed={sound} onClick={async()=>{if(!sound){try{audioRef.current??=new AudioContext();await audioRef.current.resume();}catch{setNotice(en?'Sound unavailable':'音を使えませんでした');return;}}setSound(!sound);}}>{en?'Sound':'探知音'} {sound?'ON':'OFF'}</button>
      {slow&&mode==='3d'&&<div role="status">{en?'3D is running slowly. Your search can continue in 2D.':'3Dの動作が重いようです。同じ場所から2Dで続けられます。'} <button onClick={()=>switchMode('2d')}>{en?'Continue in 2D':'2Dで続ける'}</button></div>}
      {mode==='3d'&&<PerformancePanel stats={stats} en={en} context={`exploration:${date}:${position.x},${position.z}`}/>}
        <MapDownload en={en}/><p className="search-options-credit">{en?'Source: MLIT PLATEAU, Numazu buildings, roads and vegetation 2023, terrain and water 2021; GSI Maps aerial photographs, elevation and vector-map tiles. Modified for virtual exploration; not survey-accurate.':'出典：国土交通省 PLATEAU 沼津市（建物・道路・植生2023年度／地形・水面2021年度）、地理院タイル（国土地理院・空中写真・標高・地図）を加工。バーチャル探索用の表現で、正確な測量図ではありません。'} <a href="https://www.geospatial.jp/ckan/dataset/plateau-22203-numazu-shi-2023" target="_blank" rel="noreferrer">PLATEAU</a> · <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">GSI</a></p>
      </div>
      <div className={`search-map ${sceneReady?'is-ready':''}`}>{mode==='3d'?<MapBoundary en={en} onFallback={()=>switchMode('2d')}><Suspense fallback={null}><Map3D pins={EMPTY_PINS} selectedPinId={null} onSelectPin={NO_SELECT} onUpdateStats={onStats} onWebGLError={onError} search={bridge}/></Suspense><span className="search-center" aria-hidden="true">＋</span></MapBoundary>:<Exploration2D en={en} position={position} onMove={setPosition} targetFishId={fish.id} target={place} discovered={!!found}/>}</div>
      <div className="search-actions search-discover">{found?<button className="primary-action-btn" onClick={openCard}>{en?'View discovery card':'発見カードを見る'}</button>:<button className="primary-action-btn" disabled={!hint.near||(mode==='3d'&&!visible)} onClick={discover}>{hint.near?(en?'Discover the fish!':'魚を発見する！'):(en?'Follow the detector':'探知機を頼りに近づこう')}</button>}{immersive&&(slow?<button className="search-low-fps" onClick={()=>switchMode('2d')}>{en?'Lighter 2D':'軽い2Dへ'}</button>:<small>PLATEAU / GSI</small>)}</div>
    </>}
    {immersive&&!sceneReady&&<ExplorationLoading locale={props.locale} fish={fish} onBack={props.onBack} on2D={()=>switchMode('2d')}/>}
    {found&&showingCard&&<div className="search-found"><div className="search-actions"><button className="primary-action-btn" onClick={()=>resume('3d')}>{en?'Return to the 3D city':'3Dの街に戻る'}</button><button onClick={()=>resume('2d')}>{en?'Explore in 2D':'2Dで街を歩く'}</button></div><p className="search-found-label">{en?'DISCOVERED':'発見！'}</p><h2>{getFishDisplayName(fish,props.locale)}</h2><p>{en?place.nameEn:place.name} · {date}</p><p>{en?'A discovery in virtual Numazu. Make a postcard with the scenery.':'バーチャルの沼津で出会いました。街の景色と一緒にカードにしよう。'}</p><button className="primary-action-btn" disabled={busy} onClick={generate}>{busy?(en?'Creating…':'カードを作成中…'):en?'Create discovery card':'景色入りカードを作る'}</button>{card&&<><img className="discovery-card-preview" src={card.url} alt={en?'Discovery postcard':'発見カード'}/><div className="search-actions"><a className="primary-action-btn" download={`shinkai-discovery-${date}.png`} href={card.url}>{en?'Save image':'画像を保存'}</a><button onClick={share}>{en?'Share / copy text':'共有・共有文をコピー'}</button></div><textarea readOnly aria-label={en?'Share text':'共有文'} value={text}/></>}</div>}
    {notice&&<p role="status" className="search-notice">{notice}</p>}
    <footer className="search-credit"><p>{en?'Virtual exploration. No real-world visit is recorded.':'バーチャルでの探索です。実際の来店記録は作りません。'}</p><p>{en?'Source: MLIT Project PLATEAU, Numazu buildings, roads and vegetation 2023, terrain and water 2021; GSI Maps aerial photographs, elevation and vector-map tiles. Modified for this game; not survey-accurate.':'出典：国土交通省 PLATEAU 沼津市（建物・道路・植生2023年度／地形・水面2021年度）、地理院タイル（国土地理院・空中写真・標高・地図）を加工。形状・位置はゲーム用の表現であり、正確な測量図ではありません。'}</p><a href="https://www.geospatial.jp/ckan/dataset/plateau-22203-numazu-shi-2023" target="_blank" rel="noreferrer">PLATEAU</a> · <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">GSI</a></footer>
  </section>;
}
