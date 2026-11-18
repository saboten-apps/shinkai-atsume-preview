import React, { useState } from 'react';
import type { Locale } from '../config/appConfig';
import { FishIllustration } from '../components/FishIllustration';
import {
  formatDepthText,
  formatRarityRank,
  formatSpecimenNumber,
  getFishDisplayName,
  getMessages,
} from '../lib/i18n';
import { getCompletionStats } from '../services/storageService';
import type { CollectionState, FishRecord } from '../types/schema';

interface PokedexPageProps {
  locale: Locale;
  fishList: readonly FishRecord[];
  collectionState: CollectionState;
  onSelectFish: (fishId: string) => void;
  onRestoreBackup: (jsonText: string) => { ok: boolean; error?: string };
}

/**
 * 図鑑画面（ブリーフ2・T0-06・T0-07）
 * - 24種のグリッド表示
 * - 所持済みはカラー、未所持はシルエット＋「？？？」
 * - コンプ率表示
 * - ガチャで引いた魚だけが所持になる（重複で増えない）
 * - バックアップJSON出力・復元
 */
export const PokedexPage: React.FC<PokedexPageProps> = ({
  locale,
  fishList,
  collectionState,
  onSelectFish,
  onRestoreBackup,
}) => {
  const t = getMessages(locale);
  const stats = getCompletionStats(collectionState, fishList.length);

  const [unobtainedAlertId, setUnobtainedAlertId] = useState<string | null>(null);
  const [backupJsonText, setBackupJsonText] = useState('');
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const sortedFish = React.useMemo(
    () => [...fishList].sort((a, b) => a.id.localeCompare(b.id, 'en')),
    [fishList]
  );

  const handleCardClick = (fish: FishRecord, isObtained: boolean) => {
    if (isObtained) {
      setUnobtainedAlertId(null);
      onSelectFish(fish.id);
    } else {
      setUnobtainedAlertId(fish.id);
    }
  };

  const handleExportJson = () => {
    const serialized = JSON.stringify(collectionState, null, 2);
    setBackupJsonText(serialized);
    setImportFeedback(null);
  };

  const handleDownloadJsonFile = () => {
    const serialized = JSON.stringify(collectionState, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shinkai-pokedex-backup.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportJson = () => {
    if (!backupJsonText.trim()) {
      setImportFeedback({ type: 'error', message: t.pokedex.importError });
      return;
    }
    const result = onRestoreBackup(backupJsonText);
    if (result.ok) {
      setImportFeedback({ type: 'success', message: t.pokedex.importSuccess });
    } else {
      setImportFeedback({ type: 'error', message: t.pokedex.importError });
    }
  };

  return (
    <div className="page-container pokedex-page">
      <a className="primary-action-btn" href="#/aquarium">{locale==='ja'?'集めた魚が泳ぐ水族館へ':'Visit your swimming aquarium'}</a>
      {/* ヘッダー＆コンプ率バー */}
      <section className="pokedex-summary-card">
        <div className="pokedex-summary-header">
          <h2 className="page-title">{t.pokedex.title}</h2>
          <div className="completion-stats-pill">
            <span className="completion-label">{t.pokedex.completionLabel}: </span>
            <strong className="completion-numbers">
              {t.pokedex.speciesCountFormat
                .replace('{obtained}', String(stats.obtainedCount))
                .replace('{total}', String(stats.totalCount))}{' '}
              ({stats.percentage}%)
            </strong>
          </div>
        </div>

        <div
          className="completion-progress-track"
          role="progressbar"
          aria-valuenow={stats.percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="completion-progress-fill"
            style={{ width: `${stats.percentage}%` }}
          />
        </div>

        {stats.isComplete && (
          <div className="completion-achieved-banner">{t.pokedex.completedBanner}</div>
        )}

        {unobtainedAlertId && (
          <div className="unobtained-hint-banner" role="status">
            <span>
              {t.common.specimenNumberLabel} {formatSpecimenNumber(unobtainedAlertId)} —{' '}
              {t.pokedex.unobtainedHint}
            </span>
          </div>
        )}
      </section>

      {/* 24種グリッド */}
      <section className="pokedex-grid" aria-label={t.pokedex.title}>
        {sortedFish.map((fish) => {
          const obtainedRecord = collectionState.obtainedFish[fish.id];
          const isObtained = Boolean(obtainedRecord);
          const displayName = isObtained
            ? getFishDisplayName(fish, locale)
            : t.pokedex.unobtainedName;
          const specimenNo = formatSpecimenNumber(fish.id);
          const rankInfo = formatRarityRank(fish.rarity);

          return (
            <button
              key={fish.id}
              type="button"
              className={`pokedex-grid-item ${isObtained ? 'is-obtained' : 'is-unobtained'}`}
              onClick={() => handleCardClick(fish, isObtained)}
              aria-label={`${specimenNo} ${displayName}`}
            >
              <div className="pokedex-item-top-row">
                <span className="pokedex-item-no">{specimenNo}</span>
                {isObtained ? (
                  <span className="pokedex-item-rarity">{rankInfo.fullLabel}</span>
                ) : (
                  <span className="unobtained-tag">{t.pokedex.unobtainedBadge}</span>
                )}
              </div>

              <FishIllustration
                fishId={fish.id}
                illustration={fish.illustration}
                altText={displayName}
                isObtained={isObtained}
                size="sm"
              />

              <div className="pokedex-item-body">
                <h3 className="pokedex-item-name">{displayName}</h3>

                {isObtained && fish.scientific_name && (
                  <p className="pokedex-item-sci">
                    <em>{fish.scientific_name}</em>
                  </p>
                )}

                {isObtained && (
                  <p className="pokedex-item-depth">
                    {t.common.depthLabel} {formatDepthText(fish.depth_text)}
                  </p>
                )}

                {isObtained && obtainedRecord && (
                  <p className="pokedex-item-meta">
                    {t.pokedex.obtainedDateLabel}: {obtainedRecord.firstObtainedDate} /{' '}
                    {t.pokedex.encounterCountLabel}: {obtainedRecord.encounterCount}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* バックアップ・復元セクション（設計書 88行目・T0-06） */}
      <section className="backup-section">
        <h3 className="section-title">{t.pokedex.backupSectionTitle}</h3>
        <p className="section-subtitle">{t.pokedex.backupDescription}</p>

        <div className="backup-buttons-row">
          <button type="button" className="secondary-action-btn" onClick={handleExportJson}>
            {t.pokedex.exportButton}
          </button>
          <button
            type="button"
            className="secondary-action-btn"
            onClick={handleDownloadJsonFile}
          >
            {t.pokedex.downloadJsonButton}
          </button>
          <button type="button" className="primary-action-btn" onClick={handleImportJson}>
            {t.pokedex.importButton}
          </button>
        </div>

        <textarea
          className="backup-textarea"
          rows={5}
          value={backupJsonText}
          onChange={(e) => setBackupJsonText(e.target.value)}
          placeholder={t.pokedex.importPlaceholder}
          aria-label={t.pokedex.backupSectionTitle}
        />

        {importFeedback && (
          <p
            className={`backup-feedback ${
              importFeedback.type === 'success' ? 'is-success' : 'is-error'
            }`}
            role="status"
          >
            {importFeedback.message}
          </p>
        )}
      </section>
    </div>
  );
};
