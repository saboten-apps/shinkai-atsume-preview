import {useEffect,useId,useRef,type ReactNode} from 'react';
import {HudIcon} from './HudIcon';
/** Native modal keeps taps and keyboard focus away from the flight controls. */
export function HudMenu({open,onClose,en,children}:{open:boolean;onClose:()=>void;en:boolean;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null),titleId=useId();
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open)dialog.showModal();else if(!open&&dialog.open)dialog.close();},[open]);
  return <dialog ref={ref} id="search-options" className="search-options hud-menu" aria-labelledby={titleId}
    onCancel={onClose} onClose={onClose} onKeyDown={e=>e.stopPropagation()}
    onClick={e=>{const r=e.currentTarget.getBoundingClientRect();if(e.target===e.currentTarget&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))onClose();}}>
    <div className="search-options-heading"><div><small>{en?'EXPLORATION':'探索メニュー'}</small><h2 id={titleId}>{en?'View and controls':'表示と操作'}</h2></div><button className="hud-icon-button" onClick={onClose} aria-label={en?'Close':'閉じる'}><HudIcon name="close"/></button></div>
    {children}
  </dialog>;
}
