import sites from './fishWorld.v1.json';
import { dailyPlace, HIDE_VERSION, loadDiscovery, type HidingPlace } from './domain';
export const FISH_WORLD_VERSION='fish-world-v1';
export type FishMedium='sea'|'river'|'air';
export const FISH_SITES=sites.map(site=>({
  ...site,id:`fish-world-${site.fishId}`,medium:site.medium as FishMedium,
  hint:site.medium==='air'?'街の上を飛んで、今日の魚の光を探そう。':`${site.medium==='sea'?'海':'川'}の中に反応。水面から潜って、光を探そう。`,
  hintEn:site.medium==='air'?'Fly over the town and look for today’s glowing fish.':`A signal under the ${site.medium==='sea'?'sea':'river'}. Dive below the surface and follow the glow.`,
}));
/** Existing completed hunts keep their original place, version and postcard. */
export function fishWorldSession(date:string,fishId:string){
  const legacy=dailyPlace(date),old=loadDiscovery(date,fishId,legacy.id);
  if(old)return {place:legacy as HidingPlace,version:HIDE_VERSION,found:old};
  const place=FISH_SITES.find(site=>site.fishId===fishId);
  if(!place)throw new Error(`Missing world site: ${fishId}`);
  return {place:place as HidingPlace,version:FISH_WORLD_VERSION,found:loadDiscovery(date,fishId,place.id,FISH_WORLD_VERSION)};
}
export function targetGlow(distance:number){return distance>=90?0:Math.min(1,Math.max(0,(90-distance)/65));}
