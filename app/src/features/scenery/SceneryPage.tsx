import {PerformancePanel} from '../exploration/map/components/PerformancePanel';
import type {PerformanceStats} from '../exploration/map/types';
import {Component,lazy,Suspense,useCallback,useEffect,useState} from 'react';
import type {Locale} from '../../config/appConfig';
import {PLACES} from './places';
import {PlaceIntroduction} from './PlaceIntroduction';
import {parseViewHash,VIEWS} from './viewpoint';
import water from '../exploration/waterOutline.v1.json';
import '../exploration/exploration.css';
import {HudIcon} from '../exploration/HudIcon';
import {HudMenu} from '../exploration/HudMenu';
const Map3D=lazy(()=>import('../exploration/map/components/Map3DView').then(m=>({default:m.Map3DView})));
const PINS:[]=[];
const noop=()=>{};
class ViewBoundary extends Component<{children:import('react').ReactNode;onError:()=>void},{failed:boolean}>{
  state={failed:false};static getDerivedStateFromError(){return{failed:true};}
  componentDidCatch(){this.props.onError();}render(){return this.state.failed?null:this.props.children;}
}
export default function SceneryPage({hash,locale,onBack}:{hash:string;locale:Locale;onBack:()=>void}){
  const [menu,setMenu]=useState(false);
  const [stats,setStats]=useState<PerformanceStats|null>(null);
  const en=locale==='en',viewHash=hash.startsWith('#/join/')?'#/view/port':hash,resolved=parseViewHash(viewHash);
  const [open,setOpen]=useState(false),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[map,setMap]=useState(false);
  const handleError=useCallback(()=>{setFailed(true);setOpen(false);setMap(true);},[]);
  const handleReady=useCallback(()=>setReady(true),[]);
  useEffect(()=>{
    if(!open)return;
    document.body.classList.add('exploration-immersive');
    const chrome=Array.from(document.querySelectorAll<HTMLElement>('.app-header,.app-footer'));
    const inert=chrome.map(e=>e.inert);chrome.forEach(e=>{e.inert=true;});
    return()=>{document.body.classList.remove('exploration-immersive');chrome.forEach((e,i)=>{e.inert=inert[i];});};
  },[open]);
  if(!resolved)return <section className="exploration-page scenery-landing"><h2>{en?'This scenery link is invalid':'この景色のリンクを確認できませんでした'}</h2><p>{en?'Open a complete shared link or choose a view below.':'リンクが途中で切れていないか確認するか、下の景色から開いてください。'}</p><a href="#/view/byuuo">{en?'Around Byuuo':'びゅうお周辺を見る'}</a><button onClick={onBack}>{en?'Today':'今日へ戻る'}</button></section>;
  const place=PLACES.find(p=>p.id===resolved.preset);
  const {view,preset}=resolved,title=preset?(en?VIEWS[preset].en:VIEWS[preset].ja):(en?'A shared view of Numazu':'届いた沼津の景色');
  if(open)return <section className="exploration-page is-immersive scenery-page">
    <div className="search-toolbar"><button className="hud-icon-button" onClick={()=>setOpen(false)} aria-label={en?'Back':'案内へ戻る'}><HudIcon name="back"/></button><div className="search-mission"><span className="search-mission-fish"><HudIcon name="map"/></span><div><small>{en?'FREE EXPLORATION':'沼津を、自由にさんぽ'}</small><strong>{title}</strong></div></div><button className="hud-icon-button search-menu-button" onClick={()=>setMenu(true)} aria-label={en?'Guide and settings':'案内・設定'} aria-expanded={menu}><HudIcon name="menu"/></button></div>
    <HudMenu open={menu} onClose={()=>setMenu(false)} en={en}><button onClick={()=>{setMenu(false);setOpen(false);setMap(true);}}>{en?'2D location':'2Dで場所を見る'}</button><p>{en?'Drag to look around. Press and hold a building for its story.':'ドラッグで見回す。建物を長押しすると、その場所の紹介を読めます。'}</p><PerformancePanel stats={stats} en={en} context={viewHash}/></HudMenu>
    <div className="search-map is-ready"><ViewBoundary onError={handleError}><Suspense fallback={<p>{en?'Loading the city…':'街を読み込み中…'}</p>}><Map3D initialView={view} locale={locale} onReady={handleReady} pins={PINS} selectedPinId={null} onSelectPin={noop} onUpdateStats={setStats} onWebGLError={handleError}/></Suspense></ViewBoundary></div>
    <div className="search-discover scenery-footer"><span className="scenery-footer-help">{ready?(en?'Drag to look around. Press and hold a building for details.':'ドラッグで見回し、建物の長押しで情報を確認できます。'):(en?'Loading scenery…':'景色を読み込み中…')}</span><small>PLATEAU / GSI</small></div>
  </section>;
  return <section className="exploration-page scenery-landing">
    <a href="#/places">← {en?'All places':'場所の一覧へ'}</a>
    {location.hash.startsWith('#/join/')&&<p role="status">{en?'Shared exploration invitation. Open 3D to check and join the room.':'共有探索への招待です。3Dを開いて参加を確認してください。'}</p>}
    <p className="scenery-eyebrow">NUMAZU · うみまちラボ</p><h2>{title}</h2>
    {place&&<PlaceIntroduction key={place.id} buildingId={place.buildingIds[0]} en={en} showLocationLink={false}/>}
    <p>{en?'Step into virtual Numazu. Find your own angle and send a scenery photo.':'バーチャルの沼津へ。好きな角度から眺めて、景色を一枚持ち帰ろう。'}</p>
    <p>{en?'No daily draw or account is needed.':'ガチャを引いていなくても、アカウントなしで楽しめます。'}</p>
    {failed&&<p className="search-notice" role="status">{en?'3D could not load. You can still see the location below.':'3Dを表示できませんでした。下の2D図で場所を確認できます。'}</p>}
    <div className="search-actions"><button className="primary-action-btn" onClick={()=>{setReady(false);setFailed(false);setOpen(true);}}>{en?'See the scenery in 3D':'3Dで景色を見る'}</button><button onClick={()=>setMap(!map)} aria-expanded={map}>{en?'2D location':'2Dで場所を見る'}</button></div>
    <small>{en?'Town data loads only when you open 3D. Image appearance depends on screen size and town updates.':'3Dを開いたときに街データを読み込みます。画面の縦横比や街の更新で見え方が変わります。'}</small>
    {map&&<div className="scenery-location"><svg viewBox="-1550 -2580 3000 4380" role="img" aria-label={en?'Approximate shared location on a schematic map':'共有された場所の模式図'}><rect x="-1550" y="-2580" width="3000" height="4380" fill="#e3dac5"/><path d={water.sea} fill="#487d91" fillRule="evenodd"/><path d={water.river} fill="#487d91" fillRule="evenodd"/><g fontSize="140" fill="#17354a"><text x="0" y="-2300">{en?'Station':'沼津駅'}</text><text x="-500" y="-250">{en?'Harbor':'沼津港'}</text><text x="-1400" y="-2350">N ↑</text></g><circle cx={view.focus[0]} cy={view.focus[1]} r="85" fill="#e9793b" stroke="white" strokeWidth="30"/></svg><p>{en?'Orange: shared viewpoint area. Schematic only, not real-world directions.':'オレンジ色が共有された視点の周辺です。模式図であり、現地の道案内には使えません。'}</p></div>}
    <nav className="scenery-presets" aria-label={en?'Other scenery':'ほかの景色'}>{Object.entries(VIEWS).map(([id,p])=><a key={id} href={`#/view/${id}`}>{en?p.en:p.ja}<span aria-hidden="true"> →</span></a>)}</nav>
    <button onClick={onBack}>{en?'Try today’s fish draw':'今日のガチャへ'}</button>
    <footer className="search-credit">{en?'Virtual scenery, not a real-world visit record.':'バーチャルの景色です。魚の取得や実際の来店記録は作りません。'}<p>出典：国土交通省 PLATEAU 沼津市（建物・道路・植生・都市設備2023年度／地形・水面2021年度）、地理院タイル（国土地理院）を加工。正確な測量図ではありません。</p></footer>
  </section>;
}
