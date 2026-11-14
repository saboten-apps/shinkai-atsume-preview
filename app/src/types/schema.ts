import type { Rarity, Locale } from '../config/appConfig';

/**
 * data/fish.json の各魚レコード型（T0-02）
 */
export interface FishRecord {
  id: string;
  name_ja: string;
  name_alias: string | null;
  scientific_name: string | null;
  scientific_name_note: string | null;
  name_en: string | null;
  depth_text: string;
  fact: string;
  eat_or_display_note: string;
  rarity: Rarity;
  illustration: string | null;
  sources: string[];
  needs_check: boolean;
  /** 任意のエリアヒント（未指定時は全エリアを案内） */
  area_hint?: string;
}

/**
 * data/fish.json ルート構造
 */
export interface FishCatalogData {
  version: string;
  note?: string;
  fish: FishRecord[];
}

/**
 * エリア案内定義（T0-08：最小形）
 * 実在の店名・施設の展示/提供状況を断定する文は含めない。
 */
export interface AreaDefinition {
  id: string;
  name: Record<Locale, string>;
  description: Record<Locale, string>;
  officialLinkLabel: Record<Locale, string>;
  officialUrl: string;
  mapSearchLabel: Record<Locale, string>;
  mapSearchUrl: string;
  status: 'active' | 'pending' | 'suspended';
  verifiedAt: string; // YYYY-MM-DD
  expiresAt: string;  // YYYY-MM-DD
}

/**
 * デイリーガチャ抽選結果（T0-05）
 */
export interface DailyDrawResult {
  /** 日本時間の日付文字列 (YYYY-MM-DD) */
  jstDate: string;
  /** 抽選定義のバージョン */
  lotteryVersion: string;
  /** 第1段階のハッシュ正規化値 [0, 1) */
  rarityRoll: number;
  /** 選択されたレア度 (1〜5) */
  selectedRarity: Rarity;
  /** 第2段階のハッシュ正規化値 [0, 1) */
  fishRoll: number;
  /** 選ばれた魚データ */
  fish: FishRecord;
}

/**
 * 図鑑の個別魚獲得記録（T0-06）
 */
export interface ObtainedFishEntry {
  fishId: string;
  firstObtainedDate: string; // YYYY-MM-DD (JST)
  lastObtainedDate: string;  // YYYY-MM-DD (JST)
  encounterCount: number;
  lotteryVersion: string;
}

/**
 * 日次のガチャ実行記録（T0-06：日付ごとに1件）
 */
export interface DailyHistoryEntry {
  date: string; // YYYY-MM-DD (JST)
  fishId: string;
  lotteryVersion: string;
  drawnAtIso: string;
  wasNewDiscovery: boolean;
}

/**
 * 端末内に保存する図鑑・履歴状態（T0-06）
 */
export interface CollectionState {
  schemaVersion: string;
  collectionId: string;
  obtainedFish: Record<string, ObtainedFishEntry>;
  dailyHistory: Record<string, DailyHistoryEntry>;
}

/**
 * リアクション種別（ブリーフ5）
 */
export type ReactionType = 'want_to_go' | 'visited';

/**
 * リアクション対象種別
 */
export type ReactionTargetType = 'fish' | 'area';

/**
 * 自端末のリアクション状態
 */
export interface UserReactionState {
  want_to_go: boolean;
  visited: boolean;
  updatedAtIso?: string;
}

/**
 * ローカル計測イベント（T0-09）
 */
export interface TelemetryEvent {
  eventType: 'page_view' | 'card_view' | 'destination_click';
  jstDate: string;
  screen: string;
  fishId?: string;
  areaId?: string;
  linkType?: 'official' | 'map';
  timestampIso: string;
}
