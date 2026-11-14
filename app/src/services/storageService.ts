import { APP_CONFIG, type Locale } from '../config/appConfig';
import type { CollectionState, DailyHistoryEntry, ObtainedFishEntry } from '../types/schema';
import { isValidDateString } from '../lib/gacha';

const COLLECTION_STORAGE_KEY = 'shinkai_gacha_collection_v1';
const LOCALE_STORAGE_KEY = 'shinkai_gacha_locale_v1';

/**
 * 空の図鑑状態を作成する。
 */
export function createEmptyCollectionState(): CollectionState {
  return {
    schemaVersion: '0.1',
    collectionId: APP_CONFIG.lottery.collectionId,
    obtainedFish: {},
    dailyHistory: {},
  };
}

/**
 * localStorage が利用可能かどうかを検査する（設計書 86行目）。
 */
export function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    const testKey = '__shinkai_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * 図鑑状態を localStorage から読み込む。
 */
export function loadCollectionState(): {
  state: CollectionState;
  storageAvailable: boolean;
} {
  const available = isLocalStorageAvailable();
  if (!available) {
    return { state: createEmptyCollectionState(), storageAvailable: false };
  }
  try {
    const raw = window.localStorage.getItem(COLLECTION_STORAGE_KEY);
    if (!raw) {
      return { state: createEmptyCollectionState(), storageAvailable: true };
    }
    const parsed = JSON.parse(raw) as Partial<CollectionState>;
    const normalized = normalizeCollectionState(parsed);
    return { state: normalized, storageAvailable: true };
  } catch {
    return { state: createEmptyCollectionState(), storageAvailable: available };
  }
}

/**
 * 図鑑状態を localStorage に保存する。
 * 成功時は true、保存失敗時は false を返す（保存失敗を成功として扱わない：設計書 86行目）。
 */
export function saveCollectionState(state: CollectionState): boolean {
  if (!isLocalStorageAvailable()) {
    return false;
  }
  try {
    window.localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/**
 * デイリーガチャの獲得を記録する（純粋関数として新しい CollectionState を返す：T0-06）。
 *
 * 仕様：
 * - ガチャで引いた魚だけが所持になる
 * - 日次記録は日付（YYYY-MM-DD）ごとに1件。同日の複数操作で件数を増やさない
 * - 重複：コンプ率は増えない。獲得日が異なる場合のみ出会った回数（encounterCount）を増やす
 */
export function recordDailyDrawInState(
  currentState: CollectionState,
  params: {
    jstDate: string;
    fishId: string;
    lotteryVersion?: string;
    drawnAtIso?: string;
  }
): {
  nextState: CollectionState;
  alreadyDrawnToday: boolean;
  wasNewDiscovery: boolean;
} {
  const { jstDate, fishId } = params;
  const lotteryVersion = params.lotteryVersion ?? APP_CONFIG.lottery.version;
  const drawnAtIso = params.drawnAtIso ?? new Date().toISOString();

  // すでに同じ日付の記録がある場合は一切加算せずそのまま返す（同日重複防止）
  const existingToday = currentState.dailyHistory[jstDate];
  if (existingToday) {
    return {
      nextState: currentState,
      alreadyDrawnToday: true,
      wasNewDiscovery: existingToday.wasNewDiscovery,
    };
  }

  const existingObtained = currentState.obtainedFish[fishId];
  const wasNewDiscovery = !existingObtained;

  const updatedFishEntry: ObtainedFishEntry = existingObtained
    ? {
        ...existingObtained,
        firstObtainedDate:
          jstDate < existingObtained.firstObtainedDate
            ? jstDate
            : existingObtained.firstObtainedDate,
        lastObtainedDate:
          jstDate > existingObtained.lastObtainedDate
            ? jstDate
            : existingObtained.lastObtainedDate,
        encounterCount: existingObtained.encounterCount + 1,
      }
    : {
        fishId,
        firstObtainedDate: jstDate,
        lastObtainedDate: jstDate,
        encounterCount: 1,
        lotteryVersion,
      };

  const historyEntry: DailyHistoryEntry = {
    date: jstDate,
    fishId,
    lotteryVersion,
    drawnAtIso,
    wasNewDiscovery,
  };

  const nextState: CollectionState = {
    ...currentState,
    obtainedFish: {
      ...currentState.obtainedFish,
      [fishId]: updatedFishEntry,
    },
    dailyHistory: {
      ...currentState.dailyHistory,
      [jstDate]: historyEntry,
    },
  };

  return {
    nextState,
    alreadyDrawnToday: false,
    wasNewDiscovery,
  };
}

/**
 * コンプ率と獲得数を計算する（設計書 71行目）。
 */
export function getCompletionStats(
  state: CollectionState,
  totalCount: number = APP_CONFIG.lottery.totalFishCount
): {
  obtainedCount: number;
  totalCount: number;
  percentage: number;
  isComplete: boolean;
} {
  const obtainedCount = Object.keys(state.obtainedFish).length;
  const percentage = totalCount > 0 ? Math.round((obtainedCount / totalCount) * 100) : 0;
  return {
    obtainedCount,
    totalCount,
    percentage,
    isComplete: obtainedCount >= totalCount,
  };
}

/**
 * 不完全なデータから安全な CollectionState を構築する。
 */
export function normalizeCollectionState(raw: Partial<CollectionState> | null | undefined): CollectionState {
  const base = createEmptyCollectionState();
  if (!raw || typeof raw !== 'object') return base;

  const dailyHistory: Record<string, DailyHistoryEntry> = {};
  const obtainedFish: Record<string, ObtainedFishEntry> = {};

  if (raw.obtainedFish && typeof raw.obtainedFish === 'object') {
    for (const [fishId, entry] of Object.entries(raw.obtainedFish)) {
      if (
        entry &&
        typeof entry.fishId === 'string' &&
        isValidDateString(entry.firstObtainedDate) &&
        isValidDateString(entry.lastObtainedDate) &&
        typeof entry.encounterCount === 'number' &&
        entry.encounterCount >= 1
      ) {
        obtainedFish[fishId] = {
          fishId: entry.fishId,
          firstObtainedDate: entry.firstObtainedDate,
          lastObtainedDate: entry.lastObtainedDate,
          encounterCount: Math.floor(entry.encounterCount),
          lotteryVersion: entry.lotteryVersion || APP_CONFIG.lottery.version,
        };
      }
    }
  }

  if (raw.dailyHistory && typeof raw.dailyHistory === 'object') {
    for (const [dateKey, h] of Object.entries(raw.dailyHistory)) {
      if (h && isValidDateString(dateKey) && typeof h.fishId === 'string') {
        dailyHistory[dateKey] = {
          date: dateKey,
          fishId: h.fishId,
          lotteryVersion: h.lotteryVersion || APP_CONFIG.lottery.version,
          drawnAtIso: h.drawnAtIso || new Date().toISOString(),
          wasNewDiscovery: Boolean(h.wasNewDiscovery),
        };
      }
    }
  }

  return {
    schemaVersion: '0.1',
    collectionId: APP_CONFIG.lottery.collectionId,
    obtainedFish,
    dailyHistory,
  };
}

/**
 * バックアップJSONの復元・マージ処理（設計書 88行目、T0-06）：
 * 「同じ日付の記録は重複加算しない。」
 */
export function mergeBackupJson(
  currentState: CollectionState,
  jsonString: string
): { ok: true; mergedState: CollectionState } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(jsonString) as Partial<CollectionState>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (!parsed.dailyHistory && !parsed.obtainedFish)
    ) {
      return { ok: false, error: 'Missing collection fields' };
    }

    const incoming = normalizeCollectionState(parsed);

    // 日次履歴をベースに日付昇順で再構築し、同じ日付の記録は絶対に二重加算しない
    const combinedDates = new Map<string, DailyHistoryEntry>();
    for (const [date, entry] of Object.entries(currentState.dailyHistory)) {
      combinedDates.set(date, entry);
    }
    for (const [date, entry] of Object.entries(incoming.dailyHistory)) {
      if (!combinedDates.has(date)) {
        combinedDates.set(date, entry);
      }
    }

    let rebuilt = createEmptyCollectionState();
    const sortedEntries = Array.from(combinedDates.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    for (const entry of sortedEntries) {
      const res = recordDailyDrawInState(rebuilt, {
        jstDate: entry.date,
        fishId: entry.fishId,
        lotteryVersion: entry.lotteryVersion,
        drawnAtIso: entry.drawnAtIso,
      });
      rebuilt = res.nextState;
    }

    // 万一 dailyHistory を伴わない obtainedFish 単体エントリがあった場合も欠落させず統合（同日重複加算はしない）
    for (const [fishId, obt] of [
      ...Object.entries(currentState.obtainedFish),
      ...Object.entries(incoming.obtainedFish),
    ]) {
      const existing = rebuilt.obtainedFish[fishId];
      if (!existing) {
        rebuilt.obtainedFish[fishId] = { ...obt };
      }
    }

    return { ok: true, mergedState: rebuilt };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Invalid JSON',
    };
  }
}

/**
 * 言語設定の読み込み・保存
 */
export function loadLocalePreference(): Locale {
  if (!isLocalStorageAvailable()) return 'ja';
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return saved === 'en' ? 'en' : 'ja';
  } catch {
    return 'ja';
  }
}

export function saveLocalePreference(locale: Locale): void {
  if (!isLocalStorageAvailable()) return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}
