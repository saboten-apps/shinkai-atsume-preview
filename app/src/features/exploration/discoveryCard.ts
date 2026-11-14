import { loadIllustrationImage } from '../../lib/cardGenerator';
import { getFishDisplayName } from '../../lib/i18n';
import type { FishRecord } from '../../types/schema';
import type { Locale } from '../../config/appConfig';
import type { HidingPlace } from './domain';

export async function makeDiscoveryCard(fish: FishRecord, date: string, place: HidingPlace, locale: Locale, scene?: string): Promise<Blob> {
  const background = new Image();
  background.src = scene || `${import.meta.env.BASE_URL}map/cards/${place.id}.webp`;
  await background.decode(); // Never silently replace a failed scene with a misleading card.
  const illustration = await loadIllustrationImage(fish.illustration);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const scale = Math.max(1200 / background.width, 630 / background.height);
  ctx.drawImage(background, (1200-background.width*scale)/2, (630-background.height*scale)/2, background.width*scale, background.height*scale);
  const shade = ctx.createLinearGradient(0,0,1200,0); shade.addColorStop(0,'rgba(5,23,39,.95)'); shade.addColorStop(.65,'rgba(5,23,39,.45)'); shade.addColorStop(1,'rgba(5,23,39,.7)'); ctx.fillStyle=shade;ctx.fillRect(0,0,1200,630);
  ctx.strokeStyle='#eadfc7';ctx.lineWidth=2;ctx.strokeRect(20,20,1160,590);ctx.strokeRect(27,27,1146,576);
  ctx.fillStyle='#f5f0e6';ctx.font='30px serif';ctx.fillText(locale==='ja'?'深海あつめ':'Shinkai Atsume',58,86);
  ctx.font='bold 64px serif';ctx.fillText(getFishDisplayName(fish,locale),58,204,690);
  ctx.font='30px sans-serif';ctx.fillStyle='#ffb587';ctx.fillText(locale==='ja'?place.name:place.nameEn,58,274,670);
  ctx.fillStyle='#f5f0e6';ctx.font='24px sans-serif';ctx.fillText(locale==='ja'?'バーチャル探索で発見':'Found in virtual Numazu',58,330);ctx.fillText(date.replace(/-/g,'.'),58,375);
  if(illustration) {
    // Existing fish artworks have opaque backgrounds. Keep the original art intact.
    ctx.save();ctx.beginPath();ctx.arc(948,270,180,0,Math.PI*2);ctx.clip();ctx.drawImage(illustration,768,90,360,360);ctx.restore();
  }
  ctx.font='bold 38px serif';ctx.fillText('うみまちラボ',830,532);
  ctx.font='16px sans-serif';ctx.fillText(locale==='ja'?'沼津の街で、今日の一匹に出会う。':'A new fish, a new view of Numazu.',58,520);
  ctx.font='13px sans-serif';ctx.fillText('出典：国土交通省 PLATEAU（沼津市・2021年度）を加工',58,574);
  ctx.fillText('地理院タイル（国土地理院・全国最新写真）を加工',58,594);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG export failed')),'image/png'));
}
