import React from 'react';
import { MapPin } from '../types';

interface Map2DViewProps {
  pins: MapPin[];
  selectedPinId: string | null;
  onSelectPin: (pinId: string | null) => void;
  webGLErrorReason: string | null;
}

export const Map2DView: React.FC<Map2DViewProps> = ({
  pins,
  selectedPinId,
  onSelectPin,
  webGLErrorReason,
}) => {
  return (
    <div className="map-2d-container">
      {webGLErrorReason && (
        <div className="webgl-notice-banner">
          <span className="notice-icon">ℹ</span>
          <span>{webGLErrorReason}</span>
        </div>
      )}

      {/* 2D 標本地図 SVG */}
      <div className="svg-map-wrapper">
        <svg
          viewBox="0 0 1000 800"
          className="numazu-svg-map"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="seaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0b1c2c" />
              <stop offset="100%" stopColor="#081420" />
            </linearGradient>
            <linearGradient id="groundGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ebe4d4" />
              <stop offset="100%" stopColor="#ded5c2" />
            </linearGradient>
            <pattern id="gridPattern" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#d5ccb8" strokeWidth="0.5" strokeOpacity="0.4" />
            </pattern>
          </defs>

          {/* 背景：海（駿河湾・港口） */}
          <rect width="1000" height="800" fill="url(#seaGrad)" />

          {/* 陸地ベース（千本港町・市街地） */}
          <path
            d="M 50,0 L 750,0 L 750,220 L 710,240 L 710,480 L 680,510 L 630,510 L 590,440 L 520,440 L 480,500 L 400,500 L 370,620 L 260,620 L 250,560 L 330,560 L 350,420 L 240,420 L 220,530 L 160,530 L 140,400 L 50,400 Z"
            fill="url(#groundGrad)"
            stroke="#b8ad96"
            strokeWidth="2"
          />

          {/* 千本松原（西側緑地） */}
          <path
            d="M 50,0 L 200,0 L 170,380 L 50,380 Z"
            fill="#294430"
            fillOpacity="0.35"
          />
          <text x="90" y="180" fill="#385a40" fontSize="15" fontFamily="var(--font-serif)" letterSpacing="0.2em">
            千本松原
          </text>

          {/* グリッド線のオーバーレイ */}
          <rect width="1000" height="800" fill="url(#gridPattern)" />

          {/* 狩野川（東側） */}
          <path
            d="M 750,0 Q 730,300 780,550 T 820,800 L 920,800 Q 860,550 830,300 T 850,0 Z"
            fill="#113a5d"
            stroke="#0b2942"
            strokeWidth="1.5"
          />
          <text x="800" y="240" fill="#7ba3c4" fontSize="14" fontFamily="var(--font-serif)">
            狩野川
          </text>

          {/* 港大橋 */}
          <line x1="720" y1="230" x2="840" y2="230" stroke="#2e5b70" strokeWidth="8" strokeLinecap="round" />
          <text x="750" y="220" fill="#2e5b70" fontSize="11" fontFamily="var(--font-sans)" fontWeight="bold">
            港大橋
          </text>

          {/* 狩野川左岸（我入道側陸地） */}
          <path
            d="M 850,0 L 1000,0 L 1000,800 L 920,800 Q 860,550 830,300 T 850,0 Z"
            fill="url(#groundGrad)"
            stroke="#b8ad96"
            strokeWidth="1"
          />
          <text x="910" y="380" fill="#8c826e" fontSize="14" fontFamily="var(--font-serif)">
            我入道方面
          </text>

          {/* 沼津港 内港水域 */}
          <path
            d="M 370,420 L 580,420 L 580,490 L 460,490 L 420,550 L 370,550 Z"
            fill="#0f2b45"
            stroke="#204b73"
            strokeWidth="1"
          />
          <text x="440" y="460" fill="#588bb3" fontSize="13" fontFamily="var(--font-serif)" letterSpacing="0.1em">
            沼津港 内港
          </text>

          {/* 大型水門「びゅうお」 */}
          <g transform="translate(290, 570)">
            <rect x="0" y="0" width="80" height="20" fill="#4d7582" rx="2" stroke="#1c1b18" strokeWidth="1" />
            <rect x="10" y="-8" width="16" height="36" fill="#9e988b" stroke="#1c1b18" strokeWidth="1" />
            <rect x="54" y="-8" width="16" height="36" fill="#9e988b" stroke="#1c1b18" strokeWidth="1" />
            <text x="40" y="35" fill="#f5f0e6" fontSize="11" textAnchor="middle" fontFamily="var(--font-serif)">
              大型展望水門「びゅうお」
            </text>
          </g>

          {/* 沼津魚市場 INO */}
          <g transform="translate(360, 340)">
            <rect x="0" y="0" width="130" height="55" fill="#3a4f66" stroke="#1c1b18" strokeWidth="1.2" rx="2" />
            <text x="65" y="32" fill="#f5f0e6" fontSize="12" textAnchor="middle" fontFamily="var(--font-serif)" letterSpacing="0.05em">
              沼津魚市場 INO
            </text>
          </g>

          {/* 港八十三番地 & 深海水族館 */}
          <g transform="translate(540, 330)">
            <rect x="0" y="0" width="120" height="65" fill="#24394e" stroke="#1c1b18" strokeWidth="1.2" rx="2" />
            <text x="60" y="28" fill="#f5f0e6" fontSize="11" textAnchor="middle" fontFamily="var(--font-serif)">
              港八十三番地
            </text>
            <text x="60" y="46" fill="#c4b9a5" fontSize="10" textAnchor="middle" fontFamily="var(--font-sans)">
              (沼津港深海水族館)
            </text>
          </g>

          {/* 千本港町市街地ラベル */}
          <text x="400" y="180" fill="#7a7468" fontSize="16" fontFamily="var(--font-serif)" letterSpacing="0.15em">
            千本港町・飲食店街
          </text>
          <text x="430" y="210" fill="#9e988c" fontSize="11" fontFamily="var(--font-sans)">
            ↑ 沼津駅方面
          </text>

          {/* 駿河湾ラベル */}
          <text x="180" y="720" fill="#3a5a78" fontSize="24" fontFamily="var(--font-serif)" letterSpacing="0.25em">
            駿 河 湾
          </text>

          {/* ピンの描画 */}
          {pins.map((pin) => {
            const isSelected = pin.id === selectedPinId;
            const px = (pin.coords2d.x / 100) * 1000;
            const py = (pin.coords2d.y / 100) * 800;

            return (
              <g
                key={pin.id}
                transform={`translate(${px}, ${py})`}
                onClick={() => onSelectPin(pin.id)}
                style={{ cursor: 'pointer' }}
                className={`svg-pin-group ${isSelected ? 'selected' : ''}`}
              >
                {/* パルスリング */}
                <circle
                  r={isSelected ? '24' : '16'}
                  fill="none"
                  stroke={isSelected ? '#e8533c' : '#f5f0e6'}
                  strokeWidth="2"
                  opacity={isSelected ? '0.9' : '0.5'}
                  strokeDasharray={isSelected ? 'none' : '4,2'}
                />
                {/* ピンピン本体 */}
                <circle
                  r={isSelected ? '12' : '9'}
                  fill={isSelected ? '#e8533c' : '#c73e2c'}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                {/* ピンラベル */}
                <rect
                  x="-75"
                  y={isSelected ? '-44' : '-36'}
                  width="150"
                  height="22"
                  rx="3"
                  fill={isSelected ? '#102437' : '#07131e'}
                  fillOpacity="0.9"
                  stroke={isSelected ? '#c73e2c' : '#524e46'}
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y={isSelected ? '-29' : '-21'}
                  textAnchor="middle"
                  fill="#f5f0e6"
                  fontSize="10"
                  fontFamily="var(--font-sans)"
                  fontWeight={isSelected ? 'bold' : 'normal'}
                >
                  {pin.name.split(':')[0]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* 2D ピン一覧リスト */}
      <div className="pins-card-list">
        <div className="pins-list-header">
          <span className="pins-list-title">沼津港 検証用仮ピン一覧（5地点）</span>
          <span className="pins-list-badge">仮ピン（ダミー）</span>
        </div>
        <div className="pins-grid">
          {pins.map((pin) => {
            const isSelected = pin.id === selectedPinId;
            return (
              <button
                key={pin.id}
                type="button"
                className={`pin-card-btn ${isSelected ? 'active' : ''}`}
                onClick={() => onSelectPin(pin.id)}
              >
                <div className="pin-card-top">
                  <span className="pin-category-tag">{pin.category}</span>
                  <span className="pin-dummy-pill">仮ピン</span>
                </div>
                <div className="pin-card-name">{pin.name}</div>
                <div className="pin-card-desc">{pin.description}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
