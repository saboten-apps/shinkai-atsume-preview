import {useState} from 'react';
import {placeForBuilding} from './places';
export function PlaceIntroduction({buildingId,en,showLocationLink=true}:{buildingId:string;en:boolean;showLocationLink?:boolean}){
  const place=placeForBuilding(buildingId);
  const [notice,setNotice]=useState(''),[imageFailed,setImageFailed]=useState(false);
  if(!place)return <p>{en?'No introduction yet for this building.':'この建物の紹介はまだありません。'}</p>;
  const title=en?place.en:place.ja;
  const url=new URL(`${location.pathname}${location.search}#/view/${place.id}`,location.origin).href;
  async function share(){
    setNotice('');
    try{
      if(navigator.share)await navigator.share({title,url});
      else {await navigator.clipboard.writeText(url);setNotice(en?'Link copied':'リンクをコピーしました');}
    }catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))setNotice(en?'Use the location link below to share.':'下の場所リンクを長押しして共有できます。');}
  }
  return <section className="place-introduction" aria-label={title}>
    <h3>{title}</h3>
    {!imageFailed?<img src={`${import.meta.env.BASE_URL}${place.photo}`} alt={en?`Photograph of ${title}`:`${title}の現地写真`} onError={()=>setImageFailed(true)}/>:<p>{en?'Photograph unavailable':'写真を読み込めませんでした'}</p>}
    <small>{place.credit||(en?'Photo provided by the project owner':'現地写真：制作者撮影・提供')}</small>
    <p>{en?place.descriptionEn:place.descriptionJa}</p>
    {place.url&&<p><a href={place.url} target="_blank" rel="noopener noreferrer">{en?'Related website':'関連サイト'} ↗</a></p>}
    <small>{en?'Virtual reconstruction based on photographs and city data.':'写真と都市データをもとにしたバーチャル表現です。'}</small>
    <div className="place-actions"><button type="button" onClick={share}>{en?'Share this place':'この場所を共有'}</button>{(showLocationLink||notice)&&<a href={url}>{en?'Location link':'この場所から開く'}</a>}</div>
    {notice&&<p role="status">{notice}</p>}
  </section>;
}
