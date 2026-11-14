import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import rawFishCatalog from '../../data/fish.json';
import { FishIllustration } from '../components/FishIllustration';
import { AREAS, getActiveAreas } from '../data/areas';
import {
  clearIllustrationImageCache,
  generateResultCardPngDataUrl,
} from '../lib/cardGenerator';
import { getFishDisplayName } from '../lib/i18n';
import { validateAreas, validateFishCatalog } from '../lib/validator';
import { LocalReactionService } from '../services/reactionService';
import {
  createEmptyCollectionState,
  getCompletionStats,
  mergeBackupJson,
  recordDailyDrawInState,
} from '../services/storageService';
import type { FishCatalogData, FishRecord } from '../types/schema';

const catalog = rawFishCatalog as unknown as FishCatalogData;

describe('Schema & Data Validation (T0-02 & T0-08)', () => {
  it('validates data/fish.json (24 species) with 0 errors', () => {
    const report = validateFishCatalog(catalog, {
      expectedCount: 24,
      strictVerification: false,
    });
    expect(report.valid).toBe(true);
    expect(report.errors).toHaveLength(0);
    // needs_check=true の魚が warning として検出されること
    expect(report.warnings.some((w) => w.code === 'NEEDS_CHECK')).toBe(true);
  });

  it('detects duplicate IDs, missing sources, and invalid URLs in fish catalog', () => {
    const brokenCatalog: FishCatalogData = {
      version: '0.1',
      fish: [
        {
          ...catalog.fish[0],
          id: 'dup01',
          sources: ['not-a-valid-url'],
        },
        {
          ...catalog.fish[1],
          id: 'dup01',
          sources: [],
        },
      ],
    };
    const report = validateFishCatalog(brokenCatalog, { expectedCount: 2 });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.code === 'DUPLICATE_FISH_ID')).toBe(true);
    expect(report.errors.some((e) => e.code === 'INVALID_SOURCE_URL')).toBe(true);
    expect(report.errors.some((e) => e.code === 'MISSING_SOURCES')).toBe(true);
  });

  it('validates AREAS and filters out expired or non-active areas (T0-08)', () => {
    const areaReport = validateAreas(AREAS);
    expect(areaReport.valid).toBe(true);
    expect(areaReport.errors).toHaveLength(0);

    const activeNow = getActiveAreas('2026-11-09', AREAS);
    expect(activeNow).toHaveLength(2);

    const afterExpiry = getActiveAreas('2029-01-01', AREAS);
    expect(afterExpiry).toHaveLength(0);
  });
});

describe('Pokedex Collection & Backup Restore (T0-06)', () => {
  it('prevents duplicate counting on the same day and only increments encounterCount on different days', () => {
    const empty = createEmptyCollectionState();

    // 1回目（2026-11-09 に f01 を獲得）
    const first = recordDailyDrawInState(empty, {
      jstDate: '2026-11-09',
      fishId: 'f01',
    });
    expect(first.wasNewDiscovery).toBe(true);
    expect(first.alreadyDrawnToday).toBe(false);
    expect(getCompletionStats(first.nextState, 24)).toEqual({
      obtainedCount: 1,
      totalCount: 24,
      percentage: 4,
      isComplete: false,
    });
    expect(first.nextState.obtainedFish['f01'].encounterCount).toBe(1);

    // 同日の2回目操作：件数もコンプ率も一切増えない
    const sameDaySecond = recordDailyDrawInState(first.nextState, {
      jstDate: '2026-11-09',
      fishId: 'f01',
    });
    expect(sameDaySecond.alreadyDrawnToday).toBe(true);
    expect(sameDaySecond.nextState.obtainedFish['f01'].encounterCount).toBe(1);
    expect(Object.keys(sameDaySecond.nextState.dailyHistory)).toHaveLength(1);

    // 別日（2026-11-20）に同じ魚 f01 を引いた場合：コンプ率は増えず encounterCount のみ +1
    const diffDaySameFish = recordDailyDrawInState(sameDaySecond.nextState, {
      jstDate: '2026-11-20',
      fishId: 'f01',
    });
    expect(diffDaySameFish.wasNewDiscovery).toBe(false);
    expect(diffDaySameFish.nextState.obtainedFish['f01'].encounterCount).toBe(2);
    expect(getCompletionStats(diffDaySameFish.nextState, 24).obtainedCount).toBe(1);
  });

  it('merges backup JSON idempotently without double-counting same dates', () => {
    const base = recordDailyDrawInState(createEmptyCollectionState(), {
      jstDate: '2026-11-09',
      fishId: 'f01',
    }).nextState;

    const backupWithOverlap = recordDailyDrawInState(base, {
      jstDate: '2026-11-10',
      fishId: 'f02',
    }).nextState;

    const json = JSON.stringify(backupWithOverlap);
    const merged = mergeBackupJson(base, json);
    expect(merged.ok).toBe(true);
    if (merged.ok) {
      expect(Object.keys(merged.mergedState.obtainedFish)).toEqual(['f01', 'f02']);
      expect(merged.mergedState.obtainedFish['f01'].encounterCount).toBe(1);
      expect(merged.mergedState.obtainedFish['f02'].encounterCount).toBe(1);
    }
  });
});

describe('English name fallback order (Brief #7)', () => {
  it('falls back in order: name_en -> scientific_name -> name_ja when locale is "en"', () => {
    const sampleBase: FishRecord = {
      ...catalog.fish[0],
      name_ja: 'タカアシガニ',
      scientific_name: 'Macrocheira kaempferi',
      name_en: 'Japanese spider crab',
    };

    // 1. name_en が存在する場合は name_en
    expect(getFishDisplayName(sampleBase, 'en')).toBe('Japanese spider crab');

    // 2. name_en が null の間は scientific_name にフォールバック
    const withoutEn: FishRecord = { ...sampleBase, name_en: null };
    expect(getFishDisplayName(withoutEn, 'en')).toBe('Macrocheira kaempferi');

    // 3. name_en と scientific_name の両方が null の場合は name_ja にフォールバック
    const withoutSci: FishRecord = {
      ...sampleBase,
      name_en: null,
      scientific_name: null,
    };
    expect(getFishDisplayName(withoutSci, 'en')).toBe('タカアシガニ');

    // 4. locale === 'ja' の場合は常に name_ja
    expect(getFishDisplayName(sampleBase, 'ja')).toBe('タカアシガニ');
  });
});

describe('LocalReactionService (Brief #5)', () => {
  it('toggles local state and reports countAvailable=false in Stage 0', () => {
    const service = new LocalReactionService();
    const initial = service.getReactionSummary('fish', 'f01');
    expect(initial.countAvailable).toBe(false);
    expect(initial.userState.want_to_go).toBe(false);
    expect(initial.userState.visited).toBe(false);

    const afterWant = service.toggleReaction('fish', 'f01', 'want_to_go');
    expect(afterWant.userState.want_to_go).toBe(true);
    expect(afterWant.countAvailable).toBe(false);

    const afterVisited = service.toggleReaction('fish', 'f01', 'visited');
    expect(afterVisited.userState.want_to_go).toBe(true);
    expect(afterVisited.userState.visited).toBe(true);
  });
});

describe('Real Illustrations & Placeholder Fallback (FishIllustration & cardGenerator)', () => {
  it('renders <img> when illustration is set and falls back to <svg> when illustration is null', () => {
    const withIllustHtml = renderToStaticMarkup(
      React.createElement(FishIllustration, {
        fishId: 'f01',
        illustration: 'assets/fish/f01.webp',
        altText: 'タカアシガニ',
        isObtained: true,
        size: 'lg',
      })
    );
    expect(withIllustHtml).toContain('<img');
    expect(withIllustHtml).toContain('assets/fish/f01.webp');
    expect(withIllustHtml).not.toContain('<svg');
    expect(withIllustHtml).toContain('data-render-mode="image"');

    const unobtainedWithIllustHtml = renderToStaticMarkup(
      React.createElement(FishIllustration, {
        fishId: 'f01',
        illustration: 'assets/fish/f01.webp',
        altText: '？？？',
        isObtained: false,
        size: 'sm',
      })
    );
    expect(unobtainedWithIllustHtml).toContain('is-silhouette');
    expect(unobtainedWithIllustHtml).toContain('<img');
    expect(unobtainedWithIllustHtml).toContain('？？？');

    const fallbackHtml = renderToStaticMarkup(
      React.createElement(FishIllustration, {
        fishId: 'f01',
        illustration: null,
        altText: 'タカアシガニ',
        isObtained: true,
        size: 'lg',
      })
    );
    expect(fallbackHtml).toContain('<svg');
    expect(fallbackHtml).not.toContain('<img');
    expect(fallbackHtml).toContain('data-render-mode="placeholder"');
  });

  it('waits for illustration image load before drawing and converting result card to PNG, and falls back when illustration is null', async () => {
    clearIllustrationImageCache();
    const events: string[] = [];
    const drawnTexts: string[] = [];

    const mockCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      shadowColor: '',
      shadowBlur: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arc: () => {},
      arcTo: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
      clip: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      scale: () => {},
      measureText: (t: string) => ({ width: t.length * 10 }),
      fillText: (t: string) => {
        drawnTexts.push(t);
      },
      drawImage: () => {
        events.push('drawImage');
      },
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: () => mockCtx,
      toDataURL: () => {
        events.push('toDataURL');
        return 'data:image/png;base64,MOCK';
      },
    } as unknown as HTMLCanvasElement;

    const origImage = globalThis.Image;
    class AsyncMockImage {
      width = 800;
      height = 800;
      naturalWidth = 800;
      naturalHeight = 800;
      complete = false;
      decoding = 'async';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      get src() {
        return this._src;
      }
      set src(val: string) {
        this._src = val;
        setTimeout(() => {
          this.complete = true;
          events.push('imageLoaded');
          this.onload?.();
        }, 15);
      }
    }
    globalThis.Image = AsyncMockImage as unknown as typeof Image;

    try {
      // (1) illustration が設定されている場合：画像ロード完了 → drawImage → toDataURL の順になること
      const dataUrl = await generateResultCardPngDataUrl(mockCanvas, {
        fish: catalog.fish[0], // illustration: 'assets/fish/f01.webp'
        dateStr: '2026-11-09',
        isTodayResult: true,
        locale: 'ja',
      });

      expect(dataUrl).toBe('data:image/png;base64,MOCK');
      expect(events).toEqual(['imageLoaded', 'drawImage', 'drawImage', 'toDataURL']);
      expect(drawnTexts.some((t) => t.includes('プレースホルダ図'))).toBe(false);

      // (2) illustration が null の場合：プレースホルダ図にフォールバックすること
      events.length = 0;
      drawnTexts.length = 0;
      const fallbackFish: FishRecord = {
        ...catalog.fish[0],
        illustration: null,
      };
      await generateResultCardPngDataUrl(mockCanvas, {
        fish: fallbackFish,
        dateStr: '2026-11-09',
        isTodayResult: true,
        locale: 'ja',
      });

      expect(events).toEqual(['toDataURL']);
      expect(drawnTexts.some((t) => t.includes('プレースホルダ図'))).toBe(true);
    } finally {
      globalThis.Image = origImage;
    }
  });
});
