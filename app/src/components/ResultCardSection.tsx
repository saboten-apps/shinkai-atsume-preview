import React, { useEffect, useRef, useState } from 'react';
import type { Locale } from '../config/appConfig';
import {
  buildShareDraftText,
  generateResultCardPngDataUrl,
  renderResultCardToCanvas,
} from '../lib/cardGenerator';
import { getMessages } from '../lib/i18n';
import type { FishRecord } from '../types/schema';

interface ResultCardSectionProps {
  fish: FishRecord;
  dateStr: string;
  isTodayResult: boolean;
  locale: Locale;
}

/**
 * 結果カードPNG生成・プレビュー・ダウンロードセクション（ブリーフ4・T0-10）
 * Canvas で 1200×630 のカード画像（魚名、日付、レア度、実イラストまたはプレースホルダ図、仮称アプリ名、うみまちラボ沼津）を生成し、
 * 画像の読み込み完了を待ってからPNGとしてダウンロードできるようにする。
 */
export const ResultCardSection: React.FC<ResultCardSectionProps> = ({
  fish,
  dateStr,
  isTodayResult,
  locale,
}) => {
  const t = getMessages(locale);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    setIsRendering(true);

    void renderResultCardToCanvas(canvas, {
      fish,
      dateStr,
      isTodayResult,
      locale,
    }).finally(() => {
      if (!cancelled) {
        setIsRendering(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [fish, dateStr, isTodayResult, locale]);

  const handleDownloadPng = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsRendering(true);
    try {
      const dataUrl = await generateResultCardPngDataUrl(canvas, {
        fish,
        dateStr,
        isTodayResult,
        locale,
      });
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `shinkai-gacha-${dateStr}-${fish.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsRendering(false);
    }
  };

  const handleCopyDraft = async () => {
    const draft = buildShareDraftText(fish, dateStr, locale);
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API fallback
      const textarea = document.createElement('textarea');
      textarea.value = draft;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <section className="result-card-section" aria-labelledby="result-card-heading">
      <div className="section-header">
        <h3 id="result-card-heading" className="section-title">
          {t.card.sectionTitle}
        </h3>
        <p className="section-subtitle">{t.card.sectionDescription}</p>
      </div>

      <div className="canvas-preview-wrapper">
        <canvas
          ref={canvasRef}
          width={1200}
          height={630}
          className="result-card-canvas"
          aria-busy={isRendering}
          aria-label={`${fish.name_ja} (${dateStr}) 1200x630 Result Card`}
        />
      </div>

      <div className="card-actions-row">
        <button
          type="button"
          className="primary-action-btn"
          disabled={isRendering}
          onClick={handleDownloadPng}
        >
          <span>{t.card.downloadPngButton} (1200×630)</span>
        </button>

        <button type="button" className="secondary-action-btn" onClick={handleCopyDraft}>
          <span>{copied ? t.card.copiedNotice : t.card.copyDraftButton}</span>
        </button>
      </div>
    </section>
  );
};
