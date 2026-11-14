import { APP_CONFIG } from '../config/appConfig';
import type { ReactionTargetType, ReactionType, UserReactionState } from '../types/schema';
import { isLocalStorageAvailable } from './storageService';

const REACTIONS_STORAGE_KEY = 'shinkai_gacha_reactions_v1';

export type ReactionStateMap = Record<string, UserReactionState>;

/**
 * リアクション集計結果の型
 * - 段階0では countAvailable=false とし、モックの数値ではなく
 *   UI側で「（集計は公開後に開始）」と正直に表示する（ブリーフ5）。
 * - 公開後（TR工程・Workers+D1接続後）は countAvailable=true で実カウントを返す。
 */
export interface ReactionSummary {
  targetType: ReactionTargetType;
  targetId: string;
  userState: UserReactionState;
  countAvailable: boolean;
  counts?: {
    want_to_go: number;
    visited: number;
  };
}

/**
 * サーバー接続部を差し替え可能にするためのインターフェース（ブリーフ5）
 */
export interface ReactionServiceAdapter {
  getReactionSummary(targetType: ReactionTargetType, targetId: string): ReactionSummary;
  toggleReaction(
    targetType: ReactionTargetType,
    targetId: string,
    reaction: ReactionType
  ): ReactionSummary;
}

function makeKey(targetType: ReactionTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/**
 * 段階0：ローカルストレージ保存アダプタ
 * 自端末の押下状態を保持し、全体カウントは「未開始（countAvailable: false）」を返す。
 */
export class LocalReactionService implements ReactionServiceAdapter {
  private memoryFallback: ReactionStateMap = {};

  private readAll(): ReactionStateMap {
    if (!isLocalStorageAvailable()) {
      return this.memoryFallback;
    }
    try {
      const raw = window.localStorage.getItem(REACTIONS_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as ReactionStateMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return this.memoryFallback;
    }
  }

  private writeAll(map: ReactionStateMap): void {
    this.memoryFallback = map;
    if (!isLocalStorageAvailable()) return;
    try {
      window.localStorage.setItem(REACTIONS_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore quota error
    }
  }

  getReactionSummary(targetType: ReactionTargetType, targetId: string): ReactionSummary {
    const all = this.readAll();
    const key = makeKey(targetType, targetId);
    const userState = all[key] ?? { want_to_go: false, visited: false };
    return {
      targetType,
      targetId,
      userState,
      // 段階0では enableRemoteReactions=false のため false を返し、0起点のモック数値を出さない
      countAvailable: APP_CONFIG.features.enableRemoteReactions,
    };
  }

  toggleReaction(
    targetType: ReactionTargetType,
    targetId: string,
    reaction: ReactionType
  ): ReactionSummary {
    const all = this.readAll();
    const key = makeKey(targetType, targetId);
    const current = all[key] ?? { want_to_go: false, visited: false };
    const updated: UserReactionState = {
      ...current,
      [reaction]: !current[reaction],
      updatedAtIso: new Date().toISOString(),
    };
    all[key] = updated;
    this.writeAll(all);

    return {
      targetType,
      targetId,
      userState: updated,
      countAvailable: APP_CONFIG.features.enableRemoteReactions,
    };
  }
}

export const reactionService: ReactionServiceAdapter = new LocalReactionService();
