import { APP_CONFIG, type Locale } from '../config/appConfig';
import {
  getFishVisual,
  getShapeSvgPaths,
  resolveIllustrationUrl,
} from '../data/fishPlaceholders';
import type { FishRecord } from '../types/schema';
import {
  DEPTH_SCALE_TICKS,
  depthToScalePercent,
  formatDepthText,
  formatRarityRank,
  formatSpecimenNumber,
  getAppName,
  getFishDisplayName,
  getMessages,
  parseDepthRangeMeters,
} from './i18n';

export interface CardRenderOptions {
  fish: FishRecord;
  /** 表示する日付（YYYY-MM-DD） */
  dateStr: string;
  /** 当日のガチャ結果か、図鑑からのアーカイブ出力か（設計書 233行目） */
  isTodayResult: boolean;
  locale: Locale;
  /** 事前読み込み済みのイラスト画像（省略時は fish.illustration から自動読み込み） */
  illustrationImage?: HTMLImageElement | null;
}

const illustrationImageCache = new Map<string, HTMLImageElement>();

export function clearIllustrationImageCache(): void {
  illustrationImageCache.clear();
}

/**
 * fish.illustration の画像読み込み完了を待つヘルパー。
 * illustration が null の場合や読み込み失敗時は null を返し、プレースホルダ描画へフォールバックする。
 */
export function loadIllustrationImage(
  illustration: string | null | undefined
): Promise<HTMLImageElement | null> {
  const url = resolveIllustrationUrl(illustration);
  if (!url || typeof Image === 'undefined') {
    return Promise.resolve(null);
  }

  const cached = illustrationImageCache.get(url);
  if (cached && cached.complete && (cached.naturalWidth > 0 || cached.width > 0)) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      illustrationImageCache.set(url, img);
      finish(img);
    };
    img.onerror = () => {
      finish(null);
    };
    img.src = url;

    if (img.complete && (img.naturalWidth > 0 || img.width > 0)) {
      illustrationImageCache.set(url, img);
      finish(img);
    }
  });
}

/**
 * Canvas 2D コンテキスト上で行折り返しテキストを描画するヘルパー
 */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const chars = Array.from(text);
  let line = '';
  let currentY = y;
  let lineCount = 0;

  for (let i = 0; i < chars.length; i++) {
    const testLine = line + chars[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line.length > 0) {
      lineCount++;
      if (lineCount >= maxLines) {
        ctx.fillText(line.slice(0, Math.max(0, line.length - 1)) + '…', x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      line = chars[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line.length > 0) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }
  return currentY;
}

/**
 * 矩形パスで枠線を描画するヘルパー（最小角丸または直角）
 */
function strokeRectBorder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.stroke();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

/**
 * URLから短縮ドメイン表示を作る（カード用出典表示）
 */
export function formatSourceDomains(sources: string[]): string {
  const hosts = sources
    .map((url) => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return url;
      }
    })
    .filter(Boolean);
  return Array.from(new Set(hosts)).join(' / ');
}

/**
 * 1200×630 の結果カードを「博物館の展示プレート」風に Canvas へ描画する（ブリーフ4・ブリーフPolish #7）。
 * - 細い二重枠線、イラスト、図鑑番号・和名・学名・水深のラベル（目盛りバー付き）、日付、運営名を印刷物らしく整える。
 * - fish.illustration が設定されている場合は画像の読み込み完了を待ってから実イラストを描画し、
 *   null または読み込み失敗時はプレースホルダ図にフォールバックする。
 */
export async function renderResultCardToCanvas(
  canvas: HTMLCanvasElement,
  options: CardRenderOptions
): Promise<void> {
  const { fish, dateStr, isTodayResult, locale } = options;

  const loadedImage =
    options.illustrationImage !== undefined
      ? options.illustrationImage
      : fish.illustration
        ? await loadIllustrationImage(fish.illustration)
        : null;

  const width = APP_CONFIG.cardCanvas.width;   // 1200
  const height = APP_CONFIG.cardCanvas.height; // 630
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const visual = getFishVisual(fish.id);
  const t = getMessages(locale);
  const specimenNo = formatSpecimenNumber(fish.id);
  const rankInfo = formatRarityRank(fish.rarity);

  const serifFont =
    '"Shippori Mincho", "Yu Mincho", "Hiragino Mincho ProN", Georgia, serif';
  const sansFont =
    '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
  const monoFont =
    '"JetBrains Mono", "SFMono-Regular", Consolas, "Zen Kaku Gothic New", monospace';

  // カラー定義（ブリーフPolish #2：深い紺 #0B1C2C、生成り #F5F0E6、墨色 #1C1B18、差し色 #C73E2C）
  const COLOR_NAVY = '#0B1C2C';
  const COLOR_PAPER = '#F5F0E6';
  const COLOR_PAPER_SUB = '#ECE5D5';
  const COLOR_INK = '#1C1B18';
  const COLOR_INK_MUTED = '#524E46';
  const COLOR_RULE = '#BDB3A0';
  const COLOR_RED = '#C73E2C';

  // 1. 外周マウント背景（深い紺 #0B1C2C）と生成りプレート面（#F5F0E6）
  ctx.fillStyle = COLOR_NAVY;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COLOR_PAPER;
  ctx.fillRect(18, 18, width - 36, height - 36);

  // 2. 細い二重枠線（額装された展示プレート）
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 1.5;
  strokeRectBorder(ctx, 30, 30, width - 60, height - 60);

  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 0.75;
  strokeRectBorder(ctx, 36, 36, width - 72, height - 72);

  // プレート内の区切り罫線（ヘッダー下・フッター上・左右カラム間）
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 1;
  drawLine(ctx, 36, 90, width - 36, 90);
  drawLine(ctx, 36, 516, width - 36, 516);

  ctx.strokeStyle = COLOR_RULE;
  ctx.lineWidth = 1;
  drawLine(ctx, 496, 90, 496, 516);

  // 3. ヘッダーバー（アプリ名「深海あつめ」・標本プレート種別・記録日）
  ctx.fillStyle = COLOR_RED;
  ctx.fillRect(54, 52, 4, 22);

  ctx.textBaseline = 'middle';
  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 22px ${serifFont}`;
  const appTitle = getAppName(locale, false);
  ctx.fillText(appTitle, 68, 63);

  const appTitleW = ctx.measureText(appTitle).width;
  ctx.fillStyle = COLOR_INK_MUTED;
  ctx.font = `500 13px ${sansFont}`;
  const subtitleText =
    locale === 'en'
      ? '— SURUGA BAY DEEP-SEA SPECIMEN CATALOG'
      : '— 駿河湾 深海生物標本録';
  ctx.fillText(subtitleText, 68 + appTitleW + 14, 63);

  // 右上：日付・プレート区分ラベル
  const headerStampText = `${isTodayResult ? t.card.cardHeaderToday : t.card.cardHeaderArchive}  |  ${dateStr} JST`;
  ctx.font = `500 14px ${monoFont}`;
  const stampW = ctx.measureText(headerStampText).width + 28;
  const stampX = width - 54 - stampW;
  ctx.fillStyle = COLOR_PAPER_SUB;
  ctx.fillRect(stampX, 47, stampW, 32);
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 1;
  strokeRectBorder(ctx, stampX, 47, stampW, 32);
  ctx.fillStyle = COLOR_INK;
  ctx.fillText(headerStampText, stampX + 14, 63);

  // 4. 左カラム：標本イラスト窓 (x: 56..476, y: 108..498)
  const panelX = 56;
  const panelY = 108;
  const panelW = 420;
  const panelH = 390;

  ctx.fillStyle = COLOR_NAVY;
  ctx.fillRect(panelX, panelY, panelW, panelH);

  if (loadedImage) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(panelX, panelY);
    ctx.lineTo(panelX + panelW, panelY);
    ctx.lineTo(panelX + panelW, panelY + panelH);
    ctx.lineTo(panelX, panelY + panelH);
    ctx.closePath();
    ctx.clip();

    const imgW = loadedImage.naturalWidth || loadedImage.width || 800;
    const imgH = loadedImage.naturalHeight || loadedImage.height || 800;

    // 背景の深海テクスチャ層（薄く敷く）
    ctx.globalAlpha = 0.14;
    ctx.drawImage(loadedImage, panelX, panelY, panelW, panelH);
    ctx.globalAlpha = 1;

    // 標本本体（アスペクト比を維持して中央に配置）
    const pad = 18;
    const availW = panelW - pad * 2;
    const availH = panelH - pad * 2;
    const scale = Math.min(availW / imgW, availH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = panelX + (panelW - drawW) / 2;
    const drawY = panelY + (panelH - drawH) / 2;
    ctx.drawImage(loadedImage, drawX, drawY, drawW, drawH);

    ctx.restore();
  } else {
    // プレースホルダ線画（水深目盛り罫線＋標本シルエット）
    ctx.strokeStyle = 'rgba(245, 240, 230, 0.14)';
    ctx.lineWidth = 1;
    for (let gy = panelY + 55; gy < panelY + panelH - 30; gy += 55) {
      drawLine(ctx, panelX + 16, gy, panelX + panelW - 16, gy);
    }

    const paths = getShapeSvgPaths(visual.shape);
    ctx.save();
    ctx.translate(panelX + 28, panelY + 105);
    ctx.scale(1.52, 1.52);

    if (typeof Path2D !== 'undefined') {
      const bodyPath2D = new Path2D(paths.bodyPath);
      const detailPath2D = new Path2D(paths.detailPath);

      ctx.fillStyle = 'rgba(245, 240, 230, 0.12)';
      ctx.fill(bodyPath2D);

      ctx.lineWidth = 2.2;
      ctx.strokeStyle = COLOR_PAPER;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(bodyPath2D);

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = COLOR_RED;
      ctx.stroke(detailPath2D);
    } else {
      ctx.fillStyle = COLOR_PAPER;
      ctx.beginPath();
      ctx.arc(120, 60, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = COLOR_RED;
    ctx.beginPath();
    ctx.arc(paths.eyePos.cx, paths.eyePos.cy, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(245, 240, 230, 0.7)';
    ctx.font = `400 13px ${monoFont}`;
    ctx.fillText(
      locale === 'en'
        ? `Placeholder Illustration (${visual.illustrationFile})`
        : `プレースホルダ図（${visual.illustrationFile}）`,
      panelX + 16,
      panelY + panelH - 22
    );
  }

  // イラスト窓の二重枠線（外枠＝墨色、内枠＝生成り細線）
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 1.5;
  strokeRectBorder(ctx, panelX, panelY, panelW, panelH);

  ctx.strokeStyle = 'rgba(245, 240, 230, 0.28)';
  ctx.lineWidth = 0.75;
  strokeRectBorder(ctx, panelX + 6, panelY + 6, panelW - 12, panelH - 12);

  // イラスト窓左上の標本番号プレート（No.001）
  ctx.fillStyle = COLOR_PAPER;
  ctx.fillRect(panelX + 14, panelY + 14, 104, 28);
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 1;
  strokeRectBorder(ctx, panelX + 14, panelY + 14, 104, 28);
  ctx.fillStyle = COLOR_RED;
  ctx.fillRect(panelX + 14, panelY + 14, 4, 28);
  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 14px ${monoFont}`;
  ctx.fillText(specimenNo, panelX + 26, panelY + 28);

  // 5. 右カラム：標本ラベル（図鑑番号・和名・学名・水深バー・解説・出典）
  const rightX = 520;
  const rightMaxW = 622;

  // 5-1. 図鑑番号・ランク表記
  const specLabelText = `${t.common.specimenNumberLabel} ${specimenNo}`;
  ctx.fillStyle = COLOR_RED;
  ctx.font = `700 15px ${monoFont}`;
  ctx.fillText(specLabelText, rightX, 122);

  const rankLabelText = `${t.common.rarityLabel}: ${rankInfo.fullLabel} (${fish.rarity}/5)`;
  ctx.fillStyle = COLOR_INK_MUTED;
  ctx.font = `500 14px ${monoFont}`;
  const rankW = ctx.measureText(rankLabelText).width;
  ctx.fillText(rankLabelText, rightX + rightMaxW - rankW, 122);

  // 5-2. 標準和名（または英語表示名）
  const mainFishName = getFishDisplayName(fish, locale);
  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 38px ${serifFont}`;
  ctx.fillText(mainFishName, rightX, 164);

  // 5-3. 別名・和名補足 ＋ 学名（イタリック）
  const aliasParts: string[] = [];
  if (locale === 'en' && mainFishName !== fish.name_ja) {
    aliasParts.push(`${t.common.japaneseNameLabel}: ${fish.name_ja}`);
  }
  if (fish.name_alias) {
    aliasParts.push(`${t.common.aliasLabel}: ${fish.name_alias}`);
  }
  if (locale === 'ja' && fish.name_en) {
    aliasParts.push(`EN: ${fish.name_en}`);
  }
  if (aliasParts.length > 0) {
    ctx.fillStyle = COLOR_INK_MUTED;
    ctx.font = `400 15px ${sansFont}`;
    ctx.fillText(aliasParts.join('  |  '), rightX, 200);
  }

  const sciText =
    fish.scientific_name ?? fish.scientific_name_note ?? t.common.scientificNamePending;
  ctx.fillStyle = COLOR_INK_MUTED;
  ctx.font = `500 14px ${sansFont}`;
  const sciLabel = `${t.common.scientificNameLabel}: `;
  ctx.fillText(sciLabel, rightX, 224);
  const sciLabelW = ctx.measureText(sciLabel).width;
  ctx.fillStyle = COLOR_INK;
  ctx.font = `italic 17px ${serifFont}`;
  ctx.fillText(sciText, rightX + sciLabelW, 224);

  // 区切り罫線
  ctx.strokeStyle = COLOR_RULE;
  ctx.lineWidth = 1;
  drawLine(ctx, rightX, 242, rightX + rightMaxW, 242);

  // 5-4. 水深ラベル ＆ 深度帯目盛りバー（0m / 200m / 500m / 1000m / 2500m）
  const formattedDepth = formatDepthText(fish.depth_text);
  ctx.fillStyle = COLOR_INK_MUTED;
  ctx.font = `500 14px ${sansFont}`;
  const depthPrefix = `${t.common.depthLabel} `;
  ctx.fillText(depthPrefix, rightX, 264);
  const depthPrefixW = ctx.measureText(depthPrefix).width;

  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 17px ${monoFont}`;
  drawWrappedText(ctx, formattedDepth, rightX + depthPrefixW + 4, 264, rightMaxW - depthPrefixW - 8, 20, 1);

  // 目盛りトラック描画
  const barX = rightX;
  const barY = 290;
  const barW = rightMaxW;
  ctx.strokeStyle = COLOR_INK;
  ctx.lineWidth = 1;
  drawLine(ctx, barX, barY, barX + barW, barY);

  for (let i = 0; i < DEPTH_SCALE_TICKS.length; i++) {
    const tick = DEPTH_SCALE_TICKS[i];
    const ratio = i / (DEPTH_SCALE_TICKS.length - 1);
    const tx = barX + ratio * barW;
    drawLine(ctx, tx, barY - 4, tx, barY + 4);

    ctx.fillStyle = COLOR_INK_MUTED;
    ctx.font = `400 11px ${monoFont}`;
    const labelStr = `${tick}m`;
    const lw = ctx.measureText(labelStr).width;
    const lx = i === 0 ? tx : i === DEPTH_SCALE_TICKS.length - 1 ? tx - lw : tx - lw / 2;
    ctx.fillText(labelStr, lx, barY + 14);
  }

  // 該当水深帯の赤いバー描画
  const depthRange = parseDepthRangeMeters(fish.depth_text);
  if (depthRange) {
    const startPct = depthToScalePercent(depthRange.min) / 100;
    const endPct = Math.max(startPct + 0.03, depthToScalePercent(depthRange.max) / 100);
    const activeX = barX + startPct * barW;
    const activeW = Math.max(8, (endPct - startPct) * barW);
    ctx.fillStyle = COLOR_RED;
    ctx.fillRect(activeX, barY - 2.5, activeW, 5);
  }

  // 5-5. 標本解説枠
  const factBoxY = 322;
  const factBoxH = 140;
  ctx.fillStyle = COLOR_PAPER_SUB;
  ctx.fillRect(rightX, factBoxY, rightMaxW, factBoxH);
  ctx.strokeStyle = COLOR_RULE;
  ctx.lineWidth = 1;
  strokeRectBorder(ctx, rightX, factBoxY, rightMaxW, factBoxH);
  ctx.fillStyle = COLOR_INK;
  ctx.fillRect(rightX, factBoxY, 3, factBoxH);

  ctx.fillStyle = COLOR_INK_MUTED;
  ctx.font = `700 13px ${sansFont}`;
  ctx.fillText(t.common.factLabel, rightX + 16, factBoxY + 22);

  ctx.fillStyle = COLOR_INK;
  ctx.font = `400 19px ${sansFont}`;
  drawWrappedText(ctx, fish.fact, rightX + 16, factBoxY + 52, rightMaxW - 32, 30, 3);

  // 5-6. 出典ドメイン表記（小文字印刷体）
  const domainText = `${t.common.sourcesLabel}: ${formatSourceDomains(fish.sources)}`;
  ctx.fillStyle = COLOR_INK_MUTED;
  ctx.font = `400 13px ${monoFont}`;
  drawWrappedText(ctx, domainText, rightX, 484, rightMaxW, 18, 1);

  // 6. フッター（関連地域・免責・運営主体名）
  ctx.fillStyle = COLOR_INK;
  ctx.font = `700 15px ${sansFont}`;
  ctx.fillText(t.card.cardAreaHintTitle, 56, 540);

  ctx.fillStyle = COLOR_INK_MUTED;
  ctx.font = `400 13px ${sansFont}`;
  ctx.fillText(t.card.cardDisclaimer, 56, 568);

  // 右下：運営主体「うみまちラボ沼津」奥付印
  const orgLabel = `${APP_CONFIG.organizationJa} / ${APP_CONFIG.organizationEn}`;
  ctx.font = `700 15px ${serifFont}`;
  const orgWidth = ctx.measureText(orgLabel).width;
  const orgX = width - 56 - orgWidth;

  ctx.fillStyle = COLOR_RED;
  ctx.fillRect(orgX - 14, 546, 8, 8);

  ctx.fillStyle = COLOR_INK;
  ctx.fillText(orgLabel, orgX, 550);
}

/**
 * イラスト画像の読み込み完了と Canvas 描画を待ってから PNG Data URL を返す
 */
export async function generateResultCardPngDataUrl(
  canvas: HTMLCanvasElement,
  options: CardRenderOptions
): Promise<string> {
  await renderResultCardToCanvas(canvas, options);
  return canvas.toDataURL('image/png');
}

/**
 * Threads等のSNS投稿用テキスト草稿を生成する（設計書 335〜352行目）。
 * - 公開URLが未設定の間は架空URLやlocalhostを出さない。
 * - 「食べたことある？」は食用ありの裏取りがある場合のみ使用。
 */
export function buildShareDraftText(fish: FishRecord, dateStr: string, locale: Locale): string {
  const appName = getAppName(locale, false);
  const specimenNo = formatSpecimenNumber(fish.id);
  const rankInfo = formatRarityRank(fish.rarity);
  const hasVerifiedEdible = fish.eat_or_display_note.includes('食用あり');

  if (locale === 'en') {
    const displayName = getFishDisplayName(fish, 'en');
    return [
      `[${appName} | ${dateStr} JST]`,
      `Specimen ${specimenNo}: ${displayName} (${fish.name_ja}) [${rankInfo.fullLabel}]`,
      `Depth: ${formatDepthText(fish.depth_text)}`,
      `${fish.fact}`,
      `Sources: ${formatSourceDomains(fish.sources)}`,
      `#SurugaBay #Numazu #DeepSeaFish #UmimachiLabNumazu`,
    ].join('\n');
  }

  const noteTail = hasVerifiedEdible
    ? '沼津港・戸田エリアなど駿河湾沿岸の地域文化とともに記録。'
    : '駿河湾の深海生物標本として記録。';

  return [
    `【${appName}｜${dateStr}】`,
    `図鑑番号 ${specimenNo}：${fish.name_ja}${fish.name_alias ? `（${fish.name_alias}）` : ''} ［${rankInfo.fullLabel}］`,
    `水深：${formatDepthText(fish.depth_text)}`,
    `${fish.fact}`,
    `（出典：${formatSourceDomains(fish.sources)}）`,
    `${noteTail}`,
    `※魚の提供・展示は各施設の当日の状況によります`,
    `#深海あつめ #駿河湾 #沼津 #深海魚 #うみまちラボ沼津`,
  ].join('\n');
}
