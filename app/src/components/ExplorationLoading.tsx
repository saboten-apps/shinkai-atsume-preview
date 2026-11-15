import { useEffect, useRef } from 'react';
import type { Locale } from '../config/appConfig';
import type { FishRecord } from '../types/schema';
import { getFishDisplayName } from '../lib/i18n';
import { FishIllustration } from './FishIllustration';

/** Shared by the route and the scene: the fish stays with you while the city loads. */
export function ExplorationLoading({locale,fish,onBack,on2D}:{locale:Locale;fish?:FishRecord;onBack:()=>void;on2D:()=>void}) {
  const en=locale==='en', heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{
    const selector=heading.current?.closest('.exploration-page')?'.search-toolbar,.search-map,.search-discover':'.app-header,.app-footer';
    const elements=Array.from(document.querySelectorAll<HTMLElement>(selector));
    const previous=elements.map(el=>el.inert);
    elements.forEach(el=>{el.inert=true;});
    heading.current?.focus({preventScroll:true});
    return ()=>{elements.forEach((el,i)=>{el.inert=previous[i];});};
  },[]);
  return <div className="exploration-loading" role="dialog" aria-modal="true" aria-labelledby="exploration-loading-title">
    <div className="exploration-loading-content">
      <p className="exploration-loading-brand">{en?'UMIMACHI LAB · NUMAZU':'うみまちラボ · 沼津'}</p>
      {fish&&<FishIllustration fishId={fish.id} illustration={fish.illustration} altText={getFishDisplayName(fish,locale)} isObtained size="md"/>}
      <h2 ref={heading} tabIndex={-1} id="exploration-loading-title">{fish?getFishDisplayName(fish,locale):en?'Today’s fish':'今日の魚'}</h2>
      <p>{en?'Let’s find it in Numazu.':'この魚を探しに、沼津の街へ。'}</p>
      <p role="status" className="exploration-loading-status"><span aria-hidden="true"/>{en?'Preparing your flight…':'街を読み込んでいます。準備ができたら飛行開始。'}</p>
      <div className="exploration-loading-actions"><button onClick={on2D}>{en?'Continue in lightweight 2D':'待たずに2Dで探す'}</button><button onClick={onBack}>{en?'Back to result':'結果に戻る'}</button></div>
    </div>
  </div>;
}
