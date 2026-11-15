import type {RefObject} from 'react';
export function NavigationHud({rootRef,en}:{rootRef:RefObject<HTMLDivElement>;en:boolean}){
 return <div ref={rootRef} className="world-navigation">
  <div className="world-compass" role="img" aria-label={en?'Compass':'方位'}>
   <div className="world-compass-rose" data-compass-rose>
    {['N','E','S','W'].map((d,i)=><span key={d} className={`compass-${d}`}><b data-compass-letter>{en?d:['北','東','南','西'][i]}</b></span>)}
   </div><span className="world-compass-forward" aria-hidden="true">▲</span><strong data-compass-heading/>
  </div>
  <div className="world-landmark-labels">{[0,1,2].map(i=><div key={i} className="world-landmark-label" hidden><span aria-hidden="true">◇</span><b/><small/></div>)}</div>
 </div>;
}
