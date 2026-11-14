import React from 'react';
import { MapPin } from '../types';
import { getFishById } from '../data/fishHelper';

interface InfoPanelProps {
  pin: MapPin;
  onClose: () => void;
  isStamped: boolean;
  onToggleStamp: () => void;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
  pin,
  onClose,
  isStamped,
  onToggleStamp,
}) => {
  const fish = getFishById(pin.fishId);

  const handleOpenGoogleMaps = () => {
    const encoded = encodeURIComponent(pin.googleMapQuery);
    const url = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <aside className="info-panel-bottom" aria-label="店舗・スポット詳細情報">
      <div className="info-panel-header">
        <div className="info-panel-badges">
          <span className="badge-dummy">仮ピン（ダミー）</span>
          <span className="badge-category">{pin.category}</span>
        </div>
        <button
          type="button"
          className="btn-close-panel"
          onClick={onClose}
          aria-label="パネルを閉じる"
        >
          ✕
        </button>
      </div>

      <div className="info-panel-body">
        <h2 className="spot-title">{pin.name}</h2>
        <p className="spot-desc">{pin.description}</p>
        <div className="spot-disclaimer">
          {pin.note}
        </div>

        {/* 担当深海生物（標本図鑑カード風） */}
        {fish && (
          <section className="fish-specimen-card" aria-label="担当深海生物">
            <div className="specimen-label">
              <span className="specimen-tag">連動・担当深海生物</span>
              <span className="specimen-id">{fish.id.toUpperCase()}</span>
            </div>

            <div className="specimen-content">
              <div className="specimen-figure">
                <img
                  src={fish.illustration.startsWith('data:') || fish.illustration.startsWith('/') ? fish.illustration : `${import.meta.env.BASE_URL}${fish.illustration}`}
                  alt={fish.name_ja}
                  className="specimen-image"
                  loading="lazy"
                />
              </div>

              <div className="specimen-meta">
                <h3 className="specimen-name">{fish.name_ja}</h3>
                {fish.scientific_name && (
                  <p className="specimen-scientific">{fish.scientific_name}</p>
                )}
                <div className="specimen-depth">
                  <span className="meta-label">生息水深:</span>
                  <span className="meta-value">{fish.depth_text} m</span>
                </div>
                <p className="specimen-fact">{fish.fact}</p>
                {fish.eat_or_display_note && (
                  <div className="specimen-local-note">
                    <span className="meta-label">沼津での関わり:</span>
                    <span className="meta-value">{fish.eat_or_display_note}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* アクションボタン群 */}
        <div className="action-buttons-row">
          <button
            type="button"
            className="btn-action btn-map-link"
            onClick={handleOpenGoogleMaps}
          >
            <svg
              className="btn-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            ここに行く（Googleマップ）
          </button>

          <button
            type="button"
            className={`btn-action btn-stamp ${isStamped ? 'stamped' : ''}`}
            onClick={onToggleStamp}
          >
            <svg
              className="btn-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            {isStamped ? 'スタンプ押印済み（体験用）' : 'スタンプ（体験用・端末内のみ）'}
          </button>
        </div>
      </div>
    </aside>
  );
};
