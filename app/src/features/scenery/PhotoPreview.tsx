import {createPortal} from 'react-dom';
import {useEffect,useRef,useState} from 'react';
export interface SceneryPhoto {achievements?:string[];blob:Blob; url:string; link:string}
export function PhotoPreview({photo,en,onClose}:{photo:SceneryPhoto;en:boolean;onClose:()=>void}) {
  const [notice,setNotice]=useState('');
  const close=useRef<HTMLButtonElement>(null);
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>previous?.focus?.();},[]);
  const text=`${en?'A view from virtual Numazu':'バーチャル沼津で見つけた景色'} #深海あつめ #うみまちラボ\n${photo.link}`;
  const copy=async()=>{try{await navigator.clipboard.writeText(photo.link);setNotice(en?'Link copied':'景色のリンクをコピーしました');}catch{setNotice(en?'Copy the link below.':'下のリンクを選択してコピーしてください。');}};
  const share=async()=>{
    const file=new File([photo.blob],'shinkai-numazu.png',{type:'image/png'});
    try{
      if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],text});
      else if(navigator.share)await navigator.share({text});
      else await copy();
    }catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setNotice(en?'Save the image and copy the link below.':'画像保存とリンクのコピーをご利用ください。');}
  };
  return createPortal(<div ref={root} className="scenery-photo-overlay" role="dialog" aria-modal="true" aria-label={en?'Your scenery photo':'撮影した景色'} onKeyDown={e=>{
    if(e.key==='Escape'){e.stopPropagation();onClose();}
    if(e.key==='Tab'){
      const elements=Array.from(root.current?.querySelectorAll<HTMLElement>('button,a,textarea')??[]);
      const first=elements[0],last=elements[elements.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
    }
  }}>
    <div className="scenery-photo-sheet"><header><h2>{en?'A view to take home':'この景色を持ち帰ろう'}</h2><button ref={close} onClick={onClose}>{en?'Back to the city':'街に戻る'}</button></header>
      {!!photo.achievements?.length&&<p role="status">{en?'Photo challenge complete: ':'撮影のお題達成：'}{photo.achievements.join(' / ')}</p>}
      <img className="scenery-photo-preview" src={photo.url} alt={en?'Framed virtual Numazu scenery':'枠付きのバーチャル沼津の景色'}/>
      <div className="search-actions"><a className="primary-action-btn" download="shinkai-numazu.png" href={photo.url}>{en?'Save image':'画像を保存'}</a><button onClick={share}>{en?'Share':'共有する'}</button><button onClick={copy}>{en?'Copy view link':'景色のリンクをコピー'}</button></div>
      <p>{en?'This link opens the viewpoint, time of day and season. Scenery may change when the town is updated.':'リンクを開くと同じ撮影位置・向き・時間帯・季節で街を見られます。街の更新や画面の縦横比で見え方は変わります。'}</p>
      <p>{en?'Characters and poses are kept in the saved image, not in the viewpoint link.':'キャラとポーズは保存画像に残ります。景色のリンクには含まれません。'}</p>
      <textarea readOnly aria-label={en?'Scenery link':'景色のリンク'} value={photo.link} onFocus={e=>e.currentTarget.select()}/>
      <p role="status">{notice}</p>
    </div>
  </div>,document.body);
}
