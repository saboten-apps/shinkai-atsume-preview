/**
 * アプリ全体の設定定数（T0-01）
 * 仮称アプリ名や抽選定義のバージョン、段階別の機能フラグを一元管理する。
 */

export const APP_CONFIG = {
  /** アプリ名（日本語）— 2026-11-09 ユーザー決定「深海あつめ」 */
  appNameJa: '深海あつめ',
  /** アプリ名（日本語）・商標確認中の注記が必要な文脈用 */
  appNameWithTentativeJa: '深海あつめ',
  /** アプリ名（英語） */
  appNameEn: 'Shinkai Atsume',
  /** アプリ名（英語）・注記用 */
  appNameWithTentativeEn: 'Shinkai Atsume',

  /** 運営主体名 */
  organizationJa: 'うみまちラボ沼津',
  organizationEn: 'Umimachi Lab Numazu',

  /** 抽選定義（T0-05）：説明文やイラストの修正では変えない固定値 */
  lottery: {
    appSalt: 'shinkai-shop-gacha',
    version: 'v0.1',
    collectionId: 'suruga-initial-24',
    totalFishCount: 24,
    /**
     * レア度別の重み配分（設計書 40〜51行目）
     * ★1: 40% [0.00, 0.40)
     * ★2: 25% [0.40, 0.65)
     * ★3: 20% [0.65, 0.85)
     * ★4: 10% [0.85, 0.95)
     * ★5:  5% [0.95, 1.00)
     */
    rarityThresholds: [
      { rarity: 1 as const, min: 0.0, max: 0.4 },
      { rarity: 2 as const, min: 0.4, max: 0.65 },
      { rarity: 3 as const, min: 0.65, max: 0.85 },
      { rarity: 4 as const, min: 0.85, max: 0.95 },
      { rarity: 5 as const, min: 0.95, max: 1.0 },
    ],
  },

  /** 結果カード画像サイズ（ブリーフ4：1200×630 相当） */
  cardCanvas: {
    width: 1200,
    height: 630,
  },

  /** 段階別・環境別の機能切り替えフラグ（段階0初期値） */
  features: {
    /** 公開URL（段階0ローカル開発中は未設定＝空文字） */
    publicUrl: '',
    /** 任意クイズ機能（段階0初期は無効） */
    enableQuiz: false,
    /** 段階1：協力店（担当店）表示機能（段階0は無効） */
    enableShops: false,
    /** 段階2：イベント特設カード機能（段階0は無効） */
    enableEvents: false,
    /** 外部サーバーへの計測送信（段階0は無効・端末内記録のみ） */
    enableRemoteTelemetry: false,
    /** リアクションボタンのサーバー集計接続（段階0は無効・ローカル状態保持＋「（集計は公開後に開始）」表示） */
    enableRemoteReactions: false,
  },
} as const;

export type Rarity = 1 | 2 | 3 | 4 | 5;
export type Locale = 'ja' | 'en';
