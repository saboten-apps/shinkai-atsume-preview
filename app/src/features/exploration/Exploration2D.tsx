import React, { useRef } from 'react';
import { BOUNDS, clampPosition, type Position } from './domain';

export default function Exploration2D({ position, onMove, en }: { position: Position; onMove: (p: Position) => void; en: boolean }) {
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
    <p>{en ? 'Tap the map to move your virtual search marker. No GPS needed.' : '地図をタップして探索マーカーを移動。実際の移動やGPSは不要です。'}</p>
    <svg ref={svgRef} viewBox={`${BOUNDS.minX} ${BOUNDS.minZ} 1200 2880`} onPointerDown={select} role="img" aria-label={en ? 'Schematic map from harbor to station' : '港から駅までの模式地図'}>
      <rect x="-500" y="-2580" width="1200" height="2880" fill="#ddd6bf" />
      <path d="M700 -2200 Q300 -1900 460 -1300 Q620 -850 350 -450 L700 -100 Z" fill="#467b91" />
      <path d="M-500 -40 L-330 -160 -230 -80 -110 -240 0 -70 160 -170 270 50 700 180 V300 H-500Z" fill="#467b91" />
      <g stroke="#f5f0e6" strokeWidth="22" fill="none"><path d="M210 -2450 L100 -1900 100 -1150 -20 -190" /><path d="M-400 -2000 H500 M-400 -1500 H450 M-400 -1000 H400 M-350 -500 H400" /></g>
      <g fill="#23394b" fontSize="55" fontFamily="sans-serif"><text x="-240" y="-2400">{en ? 'Station south' : '沼津駅南側'}</text><text x="-300" y="-1250">{en ? 'Town' : '街なか'}</text><text x="320" y="-700" fontSize="42">{en ? 'River' : '川沿い'}</text><text x="-300" y="-280">{en ? 'Numazu harbor' : '沼津港'}</text></g>
      <circle cx={position.x} cy={position.z} r="38" fill="#ef8857" stroke="white" strokeWidth="12" />
      <circle cx={position.x} cy={position.z} r="65" fill="none" stroke="#b44e33" strokeWidth="3" />
    </svg>
    <div className="search-directions">{[[0,-25,'↑'],[-25,0,'←'],[25,0,'→'],[0,25,'↓']].map(([x,z,label]) => <button key={label} aria-label={`${en ? 'Move' : '移動'} ${label}`} onClick={() => onMove(clampPosition({x:position.x+Number(x),z:position.z+Number(z)}))}>{label}</button>)}</div>
    <small>{en ? 'Schematic virtual map. Not for navigation.' : 'バーチャル探索用の模式図です。現地の道案内には使えません。'}</small>
  </div>;
}
