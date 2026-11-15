import React, { lazy, Suspense, useState } from 'react';
import type { Locale } from '../config/appConfig';
import { AreaGuideSection } from '../components/AreaGuideSection';
import { DepthScaleBar } from '../components/DepthScaleBar';
import { FishIllustration } from '../components/FishIllustration';
import { ReactionButtons } from '../components/ReactionButtons';
import { ResultCardSection } from '../components/ResultCardSection';
import { drawDailyFish, getJstDateString } from '../lib/gacha';
import {
  formatRarityRank,
  formatSpecimenNumber,
  getFishDisplayName,
  getMessages,
} from '../lib/i18n';
import { recordTelemetryEvent } from '../services/telemetryService';
import type { CollectionState, DailyDrawResult, FishRecord } from '../types/schema';

const MapDownload=lazy(()=>import('../features/exploration/MapDownload'));

interface TodayGachaPageProps {
  locale: Locale;
  fishList: readonly FishRecord[];
  collectionState: CollectionState;
  onRecordDraw: (jstDate: string, fishId: string) => {
    alreadyDrawnToday: boolean;
    wasNewDiscovery: boolean;
  };
  onNavigateToFish: (fishId: string) => void;
  onNavigateToPokedex: () => void;
  onExplore: (date: string, mode?: '3d'|'2d') => void;
}

export const TodayGachaPage: React.FC<TodayGachaPageProps> = ({
  locale,
  fishList,
  collectionState,
  onRecordDraw,
  onNavigateToFish,
  onNavigateToPokedex,
  onExplore,
}) => {
  const t = getMessages(locale);
  const currentJstDate = getJstDateString();

  // 操作開始時に確定した結果日を保持する（日付をまたいで演出が終わっても開始時の日付を維持：設計書 64行目）
  const [lockedResult, setLockedResult] = useState<{
    draw: DailyDrawResult;
    wasNewDiscovery: boolean;
  } | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // 同日にすでに引いているか確認
  const todayHistory = collectionState.dailyHistory[currentJstDate];
  const activeDate = lockedResult?.draw.jstDate ?? currentJstDate;
  const hasDrawnForActiveDate = Boolean(lockedResult || todayHistory);

  const activeDrawResult: DailyDrawResult | null = React.useMemo(() => {
    if (lockedResult) {
      return lockedResult.draw;
    }
    if (todayHistory) {
      return drawDailyFish(currentJstDate, fishList);
    }
    return null;
  }, [lockedResult, todayHistory, currentJstDate, fishList]);

  const wasNewDiscovery =
    lockedResult?.wasNewDiscovery ?? todayHistory?.wasNewDiscovery ?? false;

  const handleDrawClick = () => {
    // 演出中の連打や同日再実行では処理を増やさない（設計書 60, 256行目）
    if (isDrawing || hasDrawnForActiveDate) return;

    // 操作開始時点の日本時間日付を固定
    const drawDateAtClick = getJstDateString();
    const result = drawDailyFish(drawDateAtClick, fishList);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const finalizeDraw = () => {
      const recordOutcome = onRecordDraw(drawDateAtClick, result.fish.id);
      setLockedResult({
        draw: result,
        wasNewDiscovery: recordOutcome.wasNewDiscovery,
      });
      setIsDrawing(false);
      recordTelemetryEvent({
        eventType: 'card_view',
        screen: 'today',
        fishId: result.fish.id,
      });
    };

    if (prefersReducedMotion) {
      finalizeDraw();
    } else {
      setIsDrawing(true);
      window.setTimeout(finalizeDraw, 450);
    }
  };

  const [downloadOpen,setDownloadOpen]=useState(false);
  return (
    <div className="page-container today-page">
      {/* ヒーロー＆ガチャ操作枠 */}
      <section className="gacha-hero-card">
        <div className="gacha-date-pill">
          <span>{t.gacha.todayDatePrefix}: </span>
          <strong>{activeDate}</strong>
        </div>

        <h2 className="gacha-hero-title">{t.gacha.heroTitle}</h2>
        <p className="gacha-hero-subtitle">{t.gacha.heroSubtitle}</p>

        {!hasDrawnForActiveDate && (
          <div className="gacha-action-area">
            <button
              type="button"
              className="gacha-draw-btn"
              disabled={isDrawing}
              onClick={handleDrawClick}
            >
              {isDrawing ? t.gacha.drawingStatus : t.gacha.drawButton}
            </button>
          </div>
        )}
      </section>

      {/* ガチャ結果表示後 */}
      {activeDrawResult && (
        <>
          <section className="gacha-explore-launch">
            <div className="gacha-explore-summary"><FishIllustration fishId={activeDrawResult.fish.id} illustration={activeDrawResult.fish.illustration} altText={getFishDisplayName(activeDrawResult.fish,locale)} isObtained size="sm"/><div><p>{locale==='ja'?'今日の魚と、街へ。':'Your fish. Your city.'}</p><h2>{getFishDisplayName(activeDrawResult.fish,locale)}</h2><p>{locale==='ja'?'沼津のどこかに隠れています。探して景色入りカードにしよう。':'It’s hiding somewhere in Numazu. Find it and make a scenery postcard.'}</p></div></div>
            <div className="gacha-explore-actions">
              <button className="primary-action-btn" onClick={()=>onExplore(activeDrawResult.jstDate)}>{locale==='ja'?'今日の魚を探しに行く':'Find today’s fish'} <span aria-hidden="true">→</span></button>
              <button className="secondary-action-btn" onClick={()=>onExplore(activeDrawResult.jstDate,'2d')}>{locale==='ja'?'軽い2D地図で探す':'Lightweight 2D map'}</button>
              <button className="secondary-action-btn" aria-expanded={downloadOpen} onClick={()=>setDownloadOpen(!downloadOpen)}>{locale==='ja'?'街データを事前保存':'Save town data first'}</button>
              {downloadOpen&&<Suspense fallback={null}><MapDownload en={locale==='en'}/></Suspense>}
            </div>
          </section>
          <article className="fish-result-card" aria-live="polite">
            <div className="specimen-plate-topbar">
              <div className="specimen-plate-no">
                <span className="specimen-no-caption">{t.common.specimenNumberLabel}</span>
                <strong className="specimen-no-code">
                  {formatSpecimenNumber(activeDrawResult.fish.id)}
                </strong>
              </div>
              <div className="fish-result-badges">
                <span className="badge badge-primary">{t.gacha.drawnBadgeToday}</span>
                {wasNewDiscovery ? (
                  <span className="badge badge-new">{t.gacha.newDiscoveryBadge}</span>
                ) : (
                  <span className="badge badge-owned">{t.gacha.alreadyInPokedexBadge}</span>
                )}
                {activeDrawResult.fish.needs_check && (
                  <span className="badge badge-warning">{t.common.needsCheckBadge}</span>
                )}
              </div>
            </div>

            <div className="fish-result-main-grid">
              <div className="fish-result-visual-col">
                <FishIllustration
                  fishId={activeDrawResult.fish.id}
                  illustration={activeDrawResult.fish.illustration}
                  altText={getFishDisplayName(activeDrawResult.fish, locale)}
                  isObtained={true}
                  size="lg"
                />
              </div>

              <div className="fish-result-info-col">
                <div className="fish-title-block">
                  <div className="specimen-rank-row">
                    <span className="specimen-inline-no">
                      {t.common.specimenNumberLabel}{' '}
                      {formatSpecimenNumber(activeDrawResult.fish.id)}
                    </span>
                    <span
                      className="specimen-rank-tag"
                      aria-label={`${t.common.rarityLabel} ${activeDrawResult.fish.rarity} / 5`}
                    >
                      {t.common.rarityLabel}:{' '}
                      {formatRarityRank(activeDrawResult.fish.rarity).fullLabel}
                    </span>
                  </div>

                  <h3 className="fish-main-name">
                    {getFishDisplayName(activeDrawResult.fish, locale)}
                  </h3>
                  {locale === 'en' &&
                    getFishDisplayName(activeDrawResult.fish, 'en') !==
                      activeDrawResult.fish.name_ja && (
                      <p className="fish-sub-name">{activeDrawResult.fish.name_ja}</p>
                    )}
                  {activeDrawResult.fish.name_alias && (
                    <p className="fish-alias-name">
                      {t.common.aliasLabel}: {activeDrawResult.fish.name_alias}
                    </p>
                  )}
                  <p className="fish-scientific-name">
                    <span className="sci-label">{t.common.scientificNameLabel}: </span>
                    <em className="sci-latin">
                      {activeDrawResult.fish.scientific_name ??
                        activeDrawResult.fish.scientific_name_note ??
                        t.common.scientificNamePending}
                    </em>
                  </p>
                </div>

                {/* 標本水深ラベル＋目盛りバー */}
                <div className="specimen-depth-panel">
                  <DepthScaleBar
                    depthText={activeDrawResult.fish.depth_text}
                    label={t.common.depthLabel}
                  />
                </div>

                <div className="fish-fact-box">
                  <h4 className="fact-heading">{t.common.factLabel}</h4>
                  <p className="fact-body">{activeDrawResult.fish.fact}</p>
                  {t.gacha.factLanguageNotice && (
                    <p className="fact-lang-note">{t.gacha.factLanguageNotice}</p>
                  )}
                </div>

                <div className="fish-sources-inline">
                  <span className="sources-inline-label">{t.common.sourcesLabel}: </span>
                  <ul className="sources-inline-list">
                    {activeDrawResult.fish.sources.map((url, idx) => {
                      let domain = url;
                      try {
                        domain = new URL(url).hostname.replace(/^www\./, '');
                      } catch {
                        // keep raw
                      }
                      return (
                        <li key={url}>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            <span>
                              [{idx + 1}] {domain}
                            </span>
                            <svg
                              className="inline-ext-icon"
                              width="10"
                              height="10"
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
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="fish-card-reactions">
                  <ReactionButtons
                    targetType="fish"
                    targetId={activeDrawResult.fish.id}
                    locale={locale}
                  />
                </div>

                <div className="fish-result-nav-buttons">
                  <button
                    type="button"
                    className="primary-action-btn"
                    onClick={() => onNavigateToFish(activeDrawResult.fish.id)}
                  >
                    {t.common.viewDetail}
                  </button>
                  <button
                    type="button"
                    className="secondary-action-btn"
                    onClick={onNavigateToPokedex}
                  >
                    {t.nav.pokedex}
                  </button>
                </div>
              </div>
            </div>

            <p className="same-day-notice">{t.gacha.sameDayNotice}</p>
          </article>

          {/* 結果カードPNG生成（1200×630） */}
          <ResultCardSection
            fish={activeDrawResult.fish}
            dateStr={activeDrawResult.jstDate}
            isTodayResult={true}
            locale={locale}
          />

          {/* エリア案内（最小形） */}
          <AreaGuideSection
            locale={locale}
            currentJstDate={currentJstDate}
            screen="today"
            fishId={activeDrawResult.fish.id}
          />
        </>
      )}
    </div>
  );
};
