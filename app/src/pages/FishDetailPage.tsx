import React from 'react';
import type { Locale } from '../config/appConfig';
import { AreaGuideSection } from '../components/AreaGuideSection';
import { DepthScaleBar } from '../components/DepthScaleBar';
import { FishIllustration } from '../components/FishIllustration';
import { ReactionButtons } from '../components/ReactionButtons';
import { ResultCardSection } from '../components/ResultCardSection';
import { getJstDateString } from '../lib/gacha';
import {
  formatRarityRank,
  formatSpecimenNumber,
  getFishDisplayName,
  getMessages,
} from '../lib/i18n';
import type { CollectionState, FishRecord } from '../types/schema';

interface FishDetailPageProps {
  fishId: string;
  locale: Locale;
  fishList: readonly FishRecord[];
  collectionState: CollectionState;
  onBackToPokedex: () => void;
  onBackToToday: () => void;
}

/**
 * 魚詳細画面（ブリーフ3・T0-07）
 * - 名前（日英＋学名）
 * - レア度
 * - 水深テキスト
 * - 一言メモ
 * - 出典リンク
 * - 「行きたい」「行ったよ」ボタン
 * - エリア案内（「会いに行くなら」）
 * - 結果カードPNG生成
 * ※URLを直接開いても獲得扱いにしない（設計書 258行目）。
 */
export const FishDetailPage: React.FC<FishDetailPageProps> = ({
  fishId,
  locale,
  fishList,
  collectionState,
  onBackToPokedex,
  onBackToToday,
}) => {
  const t = getMessages(locale);
  const currentJstDate = getJstDateString();

  const fish = fishList.find((f) => f.id === fishId);
  const obtainedRecord = fish ? collectionState.obtainedFish[fish.id] : undefined;

  if (!fish) {
    return (
      <div className="page-container detail-page">
        <section className="guard-card">
          <h2>{t.detail.notFoundTitle}</h2>
          <div className="guard-actions">
            <button type="button" className="primary-action-btn" onClick={onBackToPokedex}>
              {t.common.backToPokedex}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const specimenNo = formatSpecimenNumber(fish.id);

  // 未所持の魚IDに直接アクセスした場合：記録の追加や未解放情報の誤表示を行わない（設計書 258行目）
  if (!obtainedRecord) {
    return (
      <div className="page-container detail-page">
        <section className="guard-card">
          <FishIllustration
            fishId={fish.id}
            illustration={fish.illustration}
            altText={t.pokedex.unobtainedName}
            isObtained={false}
            size="md"
          />
          <h2 className="guard-title">
            {t.common.specimenNumberLabel} {specimenNo} — {t.detail.unobtainedGuardTitle}
          </h2>
          <p className="guard-body">{t.detail.unobtainedGuardBody}</p>
          <div className="guard-actions">
            <button type="button" className="primary-action-btn" onClick={onBackToToday}>
              {t.common.backToToday}
            </button>
            <button type="button" className="secondary-action-btn" onClick={onBackToPokedex}>
              {t.common.backToPokedex}
            </button>
          </div>
        </section>
      </div>
    );
  }

  const todayHistory = collectionState.dailyHistory[currentJstDate];
  const isTodayFish = todayHistory?.fishId === fish.id;
  const cardDateStr = isTodayFish ? currentJstDate : obtainedRecord.firstObtainedDate;
  const rankInfo = formatRarityRank(fish.rarity);

  return (
    <div className="page-container detail-page">
      <div className="detail-top-nav">
        <button type="button" className="back-link-btn" onClick={onBackToPokedex}>
          {t.common.backToPokedex}
        </button>
        <button type="button" className="back-link-btn" onClick={onBackToToday}>
          {t.common.backToToday}
        </button>
      </div>

      <article className="fish-detail-card">
        <div className="specimen-plate-topbar">
          <div className="specimen-plate-no">
            <span className="specimen-no-caption">{t.common.specimenNumberLabel}</span>
            <strong className="specimen-no-code">{specimenNo}</strong>
          </div>
          <div className="fish-result-badges">
            <span className="badge badge-owned">{t.detail.obtainedStatusOwned}</span>
            {isTodayFish && (
              <span className="badge badge-primary">{t.detail.obtainedStatusToday}</span>
            )}
            {fish.needs_check && (
              <span className="badge badge-warning">{t.common.needsCheckBadge}</span>
            )}
          </div>
        </div>

        <div className="fish-detail-header">
          <div className="fish-detail-visual">
            <FishIllustration
              fishId={fish.id}
              illustration={fish.illustration}
              altText={getFishDisplayName(fish, locale)}
              isObtained={true}
              size="lg"
            />
          </div>

          <div className="fish-detail-names">
            <h2 className="fish-main-name">{getFishDisplayName(fish, locale)}</h2>

            <dl className="fish-names-table">
              <div className="name-row">
                <dt>{t.common.specimenNumberLabel}</dt>
                <dd className="tabular-num">{specimenNo}</dd>
              </div>

              <div className="name-row">
                <dt>{t.common.japaneseNameLabel}</dt>
                <dd>
                  {fish.name_ja}
                  {fish.name_alias ? ` （${t.common.aliasLabel}: ${fish.name_alias}）` : ''}
                </dd>
              </div>

              <div className="name-row">
                <dt>{t.common.englishNameLabel}</dt>
                <dd>
                  {fish.name_en ? (
                    fish.name_en
                  ) : (
                    <span className="fallback-name-text">
                      {getFishDisplayName(fish, 'en')}{' '}
                      <small>({t.common.englishNamePending})</small>
                    </span>
                  )}
                </dd>
              </div>

              <div className="name-row">
                <dt>{t.common.scientificNameLabel}</dt>
                <dd>
                  {fish.scientific_name ? (
                    <em className="sci-latin">{fish.scientific_name}</em>
                  ) : (
                    <span>{fish.scientific_name_note ?? t.common.scientificNamePending}</span>
                  )}
                </dd>
              </div>

              <div className="name-row">
                <dt>{t.common.rarityLabel}</dt>
                <dd className="rarity-text tabular-num">
                  {rankInfo.fullLabel} ({fish.rarity}/5)
                </dd>
              </div>

              <div className="name-row name-row-depth">
                <dt>{t.common.depthLabel}</dt>
                <dd className="depth-text">
                  <DepthScaleBar depthText={fish.depth_text} />
                </dd>
              </div>

              <div className="name-row">
                <dt>{t.pokedex.obtainedDateLabel}</dt>
                <dd className="tabular-num">
                  {obtainedRecord.firstObtainedDate} （{t.pokedex.encounterCountLabel}:{' '}
                  {obtainedRecord.encounterCount}）
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* 生物の説明。施設ごとの展示・提供メモは今回の公開画面では表示しない。 */}
        <div className="fish-detail-facts-grid">
          <div className="fish-fact-box">
            <h3 className="fact-heading">{t.common.factLabel}</h3>
            <p className="fact-body">{fish.fact}</p>
          </div>

        </div>

        {t.detail.factUntranslatedNotice && (
          <p className="fact-lang-note">{t.detail.factUntranslatedNotice}</p>
        )}

        {fish.needs_check && (
          <p className="needs-check-notice">{t.common.needsCheckNotice}</p>
        )}

        {/* 出典リンク一覧 */}
        <div className="fish-sources-section">
          <h3 className="section-title-sm">{t.common.sourcesLabel}</h3>
          <ul className="sources-detail-list">
            {fish.sources.map((url, index) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="source-link">
                  <span>
                    [{index + 1}] {url}
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
            ))}
          </ul>
        </div>

        {/* リアクションボタン（魚詳細） */}
        <div className="fish-detail-reactions">
          <h3 className="section-title-sm">{t.reactions.sectionTitle}</h3>
          <ReactionButtons targetType="fish" targetId={fish.id} locale={locale} />
        </div>
      </article>

      {/* エリア案内（最小形） */}
      <AreaGuideSection
        locale={locale}
        currentJstDate={currentJstDate}
        screen="detail"
        fishId={fish.id}
      />

      {/* 結果カードPNG生成（1200×630） */}
      <ResultCardSection
        fish={fish}
        dateStr={cardDateStr}
        isTodayResult={isTodayFish}
        locale={locale}
      />
    </div>
  );
};
