import type {Locale} from '../../config/appConfig';
import {PLACES} from './places';
import '../exploration/exploration.css';
export default function PlacesPage({locale}:{locale:Locale}){
  const en=locale==='en';
  return <section className="exploration-page scenery-landing places-page">
    <p className="scenery-eyebrow">NUMAZU · うみまちラボ</p>
    <h2>{en?'Explore Numazu':'沼津のまちを見る'}</h2>
    <p>{en?'Choose a place from the photographs, then step into virtual Numazu.':'写真から気になる場所を選んで、バーチャルの沼津へ。'}</p>
    <p>{en?'You can read the introductions without loading 3D.':'紹介は写真と文章だけでも楽しめます。3Dは開いたときに読み込みます。'}</p>
    <div className="places-grid">{PLACES.map(place=><a className="place-tile" href={`#/view/${place.id}`} key={place.id}>
      <img src={`${import.meta.env.BASE_URL}${place.photo}`} alt={en?place.en:place.ja} loading="lazy" width="720" height="480"/>
      <div><h3>{en?place.en:place.ja}</h3><p>{en?place.descriptionEn:place.descriptionJa}</p><small>{place.credit||(en?'Photo provided by the project owner':'現地写真：制作者撮影・提供')}</small><span>{en?'See this place':'この場所を見る'} →</span></div>
    </a>)}</div>
    <p className="places-credit">{en?'Photo credits appear with each place. Virtual scenery is not a record of a real-world visit.':'写真のクレジットは各場所に記載しています。バーチャルでの探索は、実際の来訪記録とは別のものです。'}</p>
    <a href="#/view/port">{en?'See the harbor scenery':'沼津港の景色から入る'} →</a>
  </section>;
}
