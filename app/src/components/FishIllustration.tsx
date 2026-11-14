import React, { useEffect, useState } from 'react';
import rawFishCatalog from '../../data/fish.json';
import {
  getFishVisual,
  getShapeSvgPaths,
  resolveIllustrationUrl,
} from '../data/fishPlaceholders';
import { formatSpecimenNumber } from '../lib/i18n';
import type { FishCatalogData } from '../types/schema';

const catalogIllustrationMap = new Map<string, string | null>(
  (rawFishCatalog as unknown as FishCatalogData).fish.map((f) => [
    f.id,
    f.illustration ?? null,
  ])
);

interface FishIllustrationProps {
  fishId: string;
  /** fish.json の illustration パス（null の場合は従来プレースホルダSVGへフォールバック） */
  illustration?: string | null;
  altText: string;
  /** trueならカラー表示、falseなら未所持のシルエット＋「？？？」表示（ブリーフ2） */
  isObtained: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const FishIllustration: React.FC<FishIllustrationProps> = ({
  fishId,
  illustration,
  altText,
  isObtained,
  size = 'md',
}) => {
  const visual = getFishVisual(fishId);
  const paths = getShapeSvgPaths(visual.shape);
  const specimenNo = formatSpecimenNumber(fishId);

  const effectiveIllustration =
    illustration !== undefined
      ? illustration
      : (catalogIllustrationMap.get(fishId) ?? null);
  const resolvedUrl = resolveIllustrationUrl(effectiveIllustration);

  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [resolvedUrl]);

  const useRealImage = Boolean(resolvedUrl && !imgError);

  const heightClass =
    size === 'sm' ? 'fish-illust-sm' : size === 'lg' ? 'fish-illust-lg' : 'fish-illust-md';

  return (
    <div
      className={`fish-illust-container ${heightClass} ${isObtained ? 'is-obtained' : 'is-silhouette'} ${useRealImage ? 'has-real-image' : 'is-placeholder'}`}
      role="img"
      aria-label={altText}
      data-illustration-file={
        useRealImage && effectiveIllustration ? effectiveIllustration : visual.illustrationFile
      }
      data-render-mode={useRealImage ? 'image' : 'placeholder'}
    >
      {useRealImage && resolvedUrl ? (
        <>
          <img
            src={resolvedUrl}
            alt={altText}
            className="fish-illust-img"
            loading={size === 'sm' ? 'lazy' : 'eager'}
            decoding="async"
            draggable={false}
            onError={() => setImgError(true)}
          />
          {!isObtained && (
            <div className="fish-illust-mystery-overlay" aria-hidden="true">
              <span className="fish-illust-mystery-text">？？？</span>
            </div>
          )}
        </>
      ) : (
        <svg
          viewBox="0 0 240 120"
          className="fish-illust-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 標本窓の深い紺背景と内枠 */}
          <rect width="240" height="120" fill="#0B1C2C" />
          <rect
            x="6"
            y="6"
            width="228"
            height="108"
            fill="none"
            stroke="rgba(245, 240, 230, 0.22)"
            strokeWidth="0.75"
          />

          {/* 水深目盛り風の細い罫線 */}
          <line x1="16" y1="30" x2="224" y2="30" stroke="rgba(245, 240, 230, 0.14)" strokeWidth="0.5" />
          <line x1="16" y1="60" x2="224" y2="60" stroke="rgba(245, 240, 230, 0.14)" strokeWidth="0.5" />
          <line x1="16" y1="90" x2="224" y2="90" stroke="rgba(245, 240, 230, 0.14)" strokeWidth="0.5" />

          {/* 魚体線画パス：所持時は生成り線画、未所持時は暗いシルエット */}
          <path
            d={paths.bodyPath}
            fill={isObtained ? 'rgba(245, 240, 230, 0.12)' : '#07131E'}
            stroke={isObtained ? '#F5F0E6' : 'rgba(245, 240, 230, 0.24)'}
            strokeWidth={isObtained ? '2' : '1.2'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <path
            d={paths.detailPath}
            fill="none"
            stroke={isObtained ? '#C73E2C' : 'rgba(245, 240, 230, 0.18)'}
            strokeWidth={isObtained ? '1.5' : '1'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {isObtained ? (
            <>
              <circle
                cx={paths.eyePos.cx}
                cy={paths.eyePos.cy}
                r="3.5"
                fill="none"
                stroke="#F5F0E6"
                strokeWidth="1"
              />
              <circle cx={paths.eyePos.cx} cy={paths.eyePos.cy} r="1.5" fill="#C73E2C" />
            </>
          ) : (
            <text
              x="120"
              y="66"
              textAnchor="middle"
              fill="rgba(245, 240, 230, 0.55)"
              fontSize="18"
              fontWeight="500"
              letterSpacing="4"
            >
              ？？？
            </text>
          )}
        </svg>
      )}
      <span className="fish-illust-id-tag">{specimenNo}</span>
    </div>
  );
};
