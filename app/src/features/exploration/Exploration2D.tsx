import React, { useRef } from 'react';
import water from './waterOutline.v1.json';
import city from './cityStructures.v1.json';
import { FISH_SITES, targetGlow } from './fishWorld';
import catalog from '../../../data/fish.json';
import { BOUNDS, clampPosition, type Position } from './domain';

export default function Exploration2D({ position, onMove, en,targetFishId,target,discovered }: { position: Position; onMove: (p: Position) => void; en: boolean;targetFishId:string;target:Position;discovered:boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const select = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    onMove(clampPosition({ x: point.x, z: point.y }));
  };
  return <div className="search-2d">
    <p>{en ? 'North (station) is up; south (harbor) is down. Tap to move.' : '上が北（駅側）、下が南（港側）。タップして移動できます。'}</p>
    <svg ref={svgRef} viewBox={`${BOUNDS.minX} ${BOUNDS.minZ} 1200 2880`} onPointerDown={select} role="img" aria-label={en ? 'Schematic map from harbor to station' : '港から駅までの模式地図'}>
      <rect x="-500" y="-2580" width="1200" height="2880" fill="#ddd6bf" />
      <path d={water.sea} fill="#467b91" fillRule="evenodd"/><path d={water.river} fill="#467b91" fillRule="evenodd"/>
      <g stroke="#f5f0e6" strokeWidth="22" fill="none"><path d="M210 -2450 L100 -1900 100 -1150 -20 -190" /><path d="M-400 -2000 H500 M-400 -1500 H450 M-400 -1000 H400 M-350 -500 H400" /></g>
      <g fill="#23394b" fontSize="55" fontFamily="sans-serif"><text x="-240" y="-2400">{en ? 'Station south' : '沼津駅南側'}</text><text x="-300" y="-1250">{en ? 'Town' : '街なか'}</text><text x="320" y="-700" fontSize="42">{en ? 'River' : '川沿い'}</text><text x="-300" y="-280">{en ? 'Numazu harbor' : '沼津港'}</text></g>
      <g>{city.bridges.map(bridge=><g key={bridge.id}><path d={`M${bridge.a.x} ${bridge.a.z}L${bridge.b.x} ${bridge.b.z}`} stroke="#eee9d7" strokeWidth="22"/><text x={bridge.center.x+25} y={bridge.center.z-28} fill="#18394b" stroke="#eee9d7" strokeWidth="5" paintOrder="stroke" fontSize="36">{en?bridge.nameEn:bridge.name}</text></g>)}</g>
      <g aria-label={en?'Fish in virtual Numazu':'街にいる魚'}>{FISH_SITES.map(site=>{
        const p=site.fishId===targetFishId?target:site;
        const distance=Math.hypot(position.x-p.x,position.z-p.z);
        const light=site.fishId===targetFishId?targetGlow(distance)*(discovered?.3:1):0;
        const fish=catalog.fish.find(f=>f.id===site.fishId)!;
        return <g key={site.fishId} transform={`translate(${p.x} ${p.z})`} data-fish-id={site.fishId}>
          <title>{en?(fish.name_en??fish.name_ja):fish.name_ja}</title>
          {light>0&&<circle r={35+light*20} fill="#ffc76b" opacity={light*.7} data-today-glow="true"/>}
          <path d="M-22 0 Q0 -24 22 0 Q0 24 -22 0 L-38 -16 V16 Z" fill={light>0?'#ffc469':'#30576b'} stroke="#fff5dc" strokeWidth="3"/>
        </g>;
      })}</g>
      <circle cx={position.x} cy={position.z} r="38" fill="#ef8857" stroke="white" strokeWidth="12" />
      <circle cx={position.x} cy={position.z} r="65" fill="none" stroke="#b44e33" strokeWidth="3" />
    </svg>
    <div className="search-directions">{[[0,-25,'↑'],[-25,0,'←'],[25,0,'→'],[0,25,'↓']].map(([x,z,label]) => <button key={label} aria-label={`${en ? 'Move' : '移動'} ${label}`} onClick={() => onMove(clampPosition({x:position.x+Number(x),z:position.z+Number(z)}))}>{label}</button>)}</div>
    <small>{en ? 'Schematic virtual map. Not for navigation.' : 'バーチャル探索用の模式図です。現地の道案内には使えません。'}</small>
  </div>;
}
