import React from 'react';

interface HeaderProps {
  viewMode: '3d' | '2d';
  onToggleViewMode: (mode: '3d' | '2d') => void;
  webGLAvailable: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  viewMode,
  onToggleViewMode,
  webGLAvailable,
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="header-title-row">
          <h1 className="header-title">深海あつめ 3Dマップ</h1>
          <span className="badge-spike">技術検証プロトタイプ</span>
        </div>
        <div className="header-sub">沼津港周辺・軽量3D都市モデル先行検証</div>
      </div>

      <div className="header-right">
        {/* 2D / 3D 切替トグル */}
        <div className="view-toggle" role="group" aria-label="表示モード切替">
          <button
            type="button"
            className={`toggle-btn ${viewMode === '3d' ? 'active' : ''}`}
            onClick={() => onToggleViewMode('3d')}
            disabled={!webGLAvailable}
            title={!webGLAvailable ? 'WebGLが利用できない環境です' : '3D表示'}
          >
            3D
          </button>
          <button
            type="button"
            className={`toggle-btn ${viewMode === '2d' ? 'active' : ''}`}
            onClick={() => onToggleViewMode('2d')}
            title="2D表示"
          >
            2D
          </button>
        </div>
      </div>
    </header>
  );
};

export const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
      <div className="footer-notice">
        ※本画面は技術検証用プロトタイプであり、実在店舗との提携・契約・協賛等を示すものではありません（ピンはすべて仮のイメージです）。
      </div>
      <div className="footer-credit">
        出典：
        <a
          href="https://www.mlit.go.jp/plateau/"
          target="_blank"
          rel="noopener noreferrer"
          className="credit-link"
        >
          国土交通省 PLATEAU ウェブサイト
        </a>
        （3D都市モデル 沼津市 2021年度）の地理空間データをもとに、沼津港周辺（千本港町・沼津魚市場・大型水門びゅうお）を独自にジオメトリ加工・モデル化して作成。
      </div>
    </footer>
  );
};
