import type {RefObject} from 'react';
import {HudIcon} from '../../HudIcon';
export function WorldStatus({rootRef,en}:{rootRef:RefObject<HTMLDivElement>;en:boolean}){
 return <div ref={rootRef} className="world-current-status" role="group" aria-label={en?'Current area and game time':'現在地とゲーム内の季節・時刻'}>
 <div className="world-current-place"><HudIcon name="pin"/><strong data-current-area>{en?'Locating…':'現在地を確認中…'}</strong></div>
 <div className="world-current-clock"><span className="world-game-label">{en?'GAME':'ゲーム内'}</span><span data-current-season/><span data-current-period/><time data-current-time/></div>
 </div>;
}
