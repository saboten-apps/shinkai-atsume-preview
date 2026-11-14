import jaMessages from '../locales/ja.json';
import enMessages from '../locales/en.json';
import { APP_CONFIG, type Locale } from '../config/appConfig';
import type { FishRecord } from '../types/schema';

export type LocaleMessages = typeof jaMessages;

const MESSAGES: Record<Locale, LocaleMessages> = {
  ja: jaMessages,
  en: enMessages,
};

export function getMessages(locale: Locale): LocaleMessages {
  return MESSAGES[locale] ?? jaMessages;
}

/**
 * アプリ名を現在の言語に合わせて返す（設定ファイル APP_CONFIG で一元管理）。
 */
export function getAppName(locale: Locale, includeTentative = false): string {
  if (locale === 'en') {
    return includeTentative
      ? APP_CONFIG.appNameWithTentativeEn
      : APP_CONFIG.appNameEn;
  }
  return includeTentative
    ? APP_CONFIG.appNameWithTentativeJa
    : APP_CONFIG.appNameJa;
}

/**
 * 運営主体名を現在の言語に合わせて返す。
 */
export function getOrganizationName(locale: Locale): string {
  return locale === 'en' ? APP_CONFIG.organizationEn : APP_CONFIG.organizationJa;
}

/**
 * ブリーフ7の仕様：
 * 「魚名は name_en が null の間は学名→日本語名の順でフォールバック。」
 *
 * - locale === 'ja' の場合：name_ja を返す
 * - locale === 'en' の場合：name_en -> scientific_name -> name_ja の順で非null・非空文字を返す
 */
export function getFishDisplayName(fish: FishRecord, locale: Locale): string {
  if (locale === 'ja') {
    return fish.name_ja;
  }
  if (fish.name_en && fish.name_en.trim().length > 0) {
    return fish.name_en.trim();
  }
  if (fish.scientific_name && fish.scientific_name.trim().length > 0) {
    return fish.scientific_name.trim();
  }
  return fish.name_ja;
}

/**
 * 図鑑番号（標本番号）を「No.001」形式に整形する（ブリーフ5：標本ラベル化）
 */
export function formatSpecimenNumber(fishId: string): string {
  const match = fishId.match(/(\d+)/);
  if (match) {
    return `No.${match[1].padStart(3, '0')}`;
  }
  return `No.${fishId.toUpperCase()}`;
}

/**
 * レア度を標本ラベル用の静かなランク表記（RANK I〜V ＋ 最小限の★）に整形する
 */
const ROMAN_NUMERALS: Record<number, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
};

export function formatRarityRank(rarity: number): {
  roman: string;
  stars: string;
  shortLabel: string;
  fullLabel: string;
} {
  const clamped = Math.max(1, Math.min(5, Math.round(rarity)));
  const roman = ROMAN_NUMERALS[clamped] ?? String(clamped);
  const stars = '★'.repeat(clamped);
  return {
    roman,
    stars,
    shortLabel: `RANK ${roman}`,
    fullLabel: `RANK ${roman}  ${stars}`,
  };
}

/**
 * 水深テキストの表示補助（「水深 200–800m」のように標本ラベル風に整形）
 */
export function formatDepthText(depthText: string): string {
  const trimmed = depthText.trim();
  if (trimmed === '要確認' || trimmed === '不明') {
    return trimmed;
  }
  return trimmed.replace(/(\d[\d,]*)(?!\s*m|[–\-\d,])/g, '$1m');
}

/**
 * 水深スケール目盛り（駿河湾の最深部 2,500m までの深度帯）
 */
export const DEPTH_SCALE_TICKS = [0, 200, 500, 1000, 2500] as const;

/**
 * 水深（m）を 0〜100% の区分線形スケール位置に変換する
 */
export function depthToScalePercent(meters: number): number {
  const m = Math.max(0, Math.min(2500, meters));
  for (let i = 0; i < DEPTH_SCALE_TICKS.length - 1; i++) {
    const start = DEPTH_SCALE_TICKS[i];
    const end = DEPTH_SCALE_TICKS[i + 1];
    if (m >= start && m <= end) {
      const segmentRatio = (m - start) / (end - start);
      const stepPct = 100 / (DEPTH_SCALE_TICKS.length - 1);
      return i * stepPct + segmentRatio * stepPct;
    }
  }
  return 100;
}

/**
 * depth_text から深度バー表示用の [min, max] (m) を抽出する。
 * 「要確認」等で数値がない場合は null を返す。
 */
export function parseDepthRangeMeters(
  depthText: string
): { min: number; max: number } | null {
  const head = depthText.split('（')[0].trim();
  const full = depthText.trim();

  // 範囲表記（例: 200–800, 700–1,000以上）
  const rangeMatch =
    head.match(/(\d[\d,]*)\s*[–\-~〜]\s*(\d[\d,]*)/) ??
    full.match(/(\d[\d,]*)\s*[–\-~〜]\s*(\d[\d,]*)/);
  if (rangeMatch) {
    const min = Number(rangeMatch[1].replace(/,/g, ''));
    let max = Number(rangeMatch[2].replace(/,/g, ''));
    if (head.includes('以上') || head.includes('以深')) {
      max = Math.max(max, Math.round(max * 1.25));
    }
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }

  // 「浅海–600近く」のような表記
  const shallowRangeMatch = head.match(/浅海\s*[–\-~〜]\s*(\d[\d,]*)/);
  if (shallowRangeMatch) {
    const max = Number(shallowRangeMatch[1].replace(/,/g, ''));
    return { min: 40, max };
  }

  // 単一数値（例: 300以深, 200以上, 約500まで, 約400前後）
  const singleMatch = head.match(/(\d[\d,]*)/);
  if (singleMatch) {
    const val = Number(singleMatch[1].replace(/,/g, ''));
    if (head.includes('以深') || head.includes('以上')) {
      return { min: val, max: Math.min(2500, Math.max(val + 400, Math.round(val * 2.2))) };
    }
    if (head.includes('まで')) {
      return { min: Math.max(50, Math.round(val * 0.35)), max: val };
    }
    return { min: Math.max(0, val - 100), max: val + 150 };
  }

  return null;
}
