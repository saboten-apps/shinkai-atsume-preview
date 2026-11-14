import type { TelemetryEvent } from '../types/schema';
import { getJstDateString } from '../lib/gacha';
import { isLocalStorageAvailable } from './storageService';

const TELEMETRY_STORAGE_KEY = 'shinkai_gacha_telemetry_v1';
const MAX_LOCAL_EVENTS = 200;

/**
 * 段階0：ローカル計測サービス（設計書 266〜298行目、T0-09）
 * - 外部送信は行わず、端末内でイベント発火を記録できる分離モジュール。
 * - 計測記録に失敗してもリンク遷移等の通常操作を絶対に妨げない。
 */
export function recordTelemetryEvent(
  event: Omit<TelemetryEvent, 'jstDate' | 'timestampIso'>
): void {
  try {
    if (!isLocalStorageAvailable()) return;
    const raw = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
    const list: TelemetryEvent[] = raw ? (JSON.parse(raw) as TelemetryEvent[]) : [];
    const fullEvent: TelemetryEvent = {
      ...event,
      jstDate: getJstDateString(),
      timestampIso: new Date().toISOString(),
    };
    const next = [...list.slice(-(MAX_LOCAL_EVENTS - 1)), fullEvent];
    window.localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 計測失敗時もアプリの動作・外部リンク遷移を止めない
  }
}
