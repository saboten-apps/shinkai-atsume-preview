import React from 'react';
import type { Locale } from '../config/appConfig';
import { getActiveAreas } from '../data/areas';
import { getMessages } from '../lib/i18n';
import { recordTelemetryEvent } from '../services/telemetryService';
import { ReactionButtons } from './ReactionButtons';

interface AreaGuideSectionProps {
  locale: Locale;
  currentJstDate: string;
  screen: 'today' | 'detail';
  fishId?: string;
}

/**
 * エリア案内（最小形）（ブリーフ6・T0-08）
 * 「会いに行くなら」欄にエリア単位（沼津港エリア／戸田エリア）の案内文と
 * Google マップ検索リンク・沼津市観光協会など公式トップへのリンクのみを表示。
 * 実在の店名・施設の展示/提供状況を断定する文は一切書かない。
 */
export const AreaGuideSection: React.FC<AreaGuideSectionProps> = ({
  locale,
  currentJstDate,
  screen,
  fishId,
}) => {
  const t = getMessages(locale);
  const activeAreas = getActiveAreas(currentJstDate);

  const handleLinkClick = (areaId: string, linkType: 'official' | 'map') => {
    recordTelemetryEvent({
      eventType: 'destination_click',
      screen,
      fishId,
      areaId,
      linkType,
    });
  };

  return (
    <section className="area-guide-section" aria-labelledby="area-guide-heading">
      <div className="section-header">
        <h3 id="area-guide-heading" className="section-title">
          {t.area.sectionTitle}
        </h3>
        <p className="section-subtitle">{t.area.sectionSubtitle}</p>
      </div>

      <div className="area-cards-grid">
        {activeAreas.map((area) => (
          <article key={area.id} className="area-card">
            <h4 className="area-card-title">{area.name[locale]}</h4>
            <p className="area-card-desc">{area.description[locale]}</p>

            <div className="area-links-group">
              <a
                href={area.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="area-external-link official-link"
                onClick={() => handleLinkClick(area.id, 'official')}
              >
                <span>
                  {t.area.officialLinkPrefix}
                  {area.officialLinkLabel[locale]}
                </span>
                <svg
                  className="inline-ext-icon"
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                >
                  <path
                    d="M3.5 2.5H9.5V8.5M9.2 2.8L2.5 9.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </a>

              <a
                href={area.mapSearchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="area-external-link map-link"
                onClick={() => handleLinkClick(area.id, 'map')}
              >
                <span>
                  {t.area.mapLinkPrefix}
                  {area.mapSearchLabel[locale]}
                </span>
                <svg
                  className="inline-ext-icon"
                  width="11"
                  height="11"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                >
                  <path
                    d="M3.5 2.5H9.5V8.5M9.2 2.8L2.5 9.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </a>
            </div>

            <div className="area-card-reactions">
              <ReactionButtons
                targetType="area"
                targetId={area.id}
                locale={locale}
                compact={true}
              />
            </div>
          </article>
        ))}
      </div>

      <p className="area-disclaimer-note">{t.area.noAssertionNotice}</p>
    </section>
  );
};
