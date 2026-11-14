import { APP_CONFIG, type Rarity } from '../config/appConfig';
import type { DailyDrawResult, FishRecord } from '../types/schema';
import { hashToUnitFloat } from './sha256';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // Asia/Tokyo is UTC+9 year-round (no DST)

/**
 * 任意のDateオブジェクトまたはミリ秒タイムスタンプから、
 * 端末のローカルタイムゾーンに依存しない日本時間（Asia/Tokyo）の
 * 日付文字列 "YYYY-MM-DD" を返す（T0-05・設計書 28〜31行目）。
 */
export function getJstDateString(now: Date | number = new Date()): string {
  const timestampMs = typeof now === 'number' ? now : now.getTime();
  if (!Number.isFinite(timestampMs)) {
    throw new Error('Invalid date provided to getJstDateString');
  }
  const jstTime = new Date(timestampMs + JST_OFFSET_MS);
  const year = jstTime.getUTCFullYear();
  const month = String(jstTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstTime.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * YYYY-MM-DD 形式の文字列かどうかを検証する。
 */
export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * 0以上1未満の値から設計書の区間定義に従ってレア度（1〜5）を選択する。
 * 設計書 51行目：「レア度選択の区間は、順に0〜40%、40〜65%、65〜85%、85〜95%、95〜100%とし、
 * 境界は下端を含み、上端を含めない。」
 */
export function selectRarityFromRoll(roll: number): Rarity {
  const clamped = Math.max(0, Math.min(roll, 0.999999999999));
  for (const threshold of APP_CONFIG.lottery.rarityThresholds) {
    if (clamped >= threshold.min && clamped < threshold.max) {
      return threshold.rarity;
    }
  }
  return 5;
}

/**
 * 日本時間の日付文字列 (YYYY-MM-DD) をシードに、24種から全員共通の1種を決定論的に選ぶ（T0-05）。
 *
 * 設計書 31〜38行目の手順：
 * 1. 日本時間の日付を年月日の固定形式 (YYYY-MM-DD) にする。
 * 2. アプリ固有の固定文字列、抽選定義の版、日付を決められた順序で組み合わせる。
 * 3. レア度選択用と魚選択用で識別文字列を変え、それぞれSHA-256で値を得る。
 * 4. ハッシュの先頭4バイトを符号なし・ビッグエンディアンの整数として扱い、2の32乗で割って、0以上1未満の値にする。
 * 5. 一方でレア度を選び、もう一方でそのレア度に属する魚を等確率で選ぶ。
 * 魚の並び順は安定したIDの昇順とし、JSON内の記述順には依存させない。
 */
export function drawDailyFish(
  jstDate: string,
  fishList: readonly FishRecord[],
  options?: {
    appSalt?: string;
    lotteryVersion?: string;
  }
): DailyDrawResult {
  if (!isValidDateString(jstDate)) {
    throw new Error(`Invalid JST date string: "${jstDate}". Expected YYYY-MM-DD.`);
  }
  if (!fishList || fishList.length === 0) {
    throw new Error('Fish list cannot be empty.');
  }

  const appSalt = options?.appSalt ?? APP_CONFIG.lottery.appSalt;
  const lotteryVersion = options?.lotteryVersion ?? APP_CONFIG.lottery.version;

  // レア度選択用と魚選択用で識別文字列を分ける
  const raritySeed = `${appSalt}:${lotteryVersion}:${jstDate}:rarity`;
  const fishSeed = `${appSalt}:${lotteryVersion}:${jstDate}:fish`;

  const rarityRoll = hashToUnitFloat(raritySeed);
  const fishRoll = hashToUnitFloat(fishSeed);

  const selectedRarity = selectRarityFromRoll(rarityRoll);

  // 魚の並び順は安定したIDの昇順とし、JSON内の記述順に依存させない
  const sortedAll = [...fishList].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const rarityPool = sortedAll.filter((f) => f.rarity === selectedRarity);
  const candidatePool = rarityPool.length > 0 ? rarityPool : sortedAll;

  const selectedIndex = Math.min(
    candidatePool.length - 1,
    Math.floor(fishRoll * candidatePool.length)
  );
  const chosenFish = candidatePool[selectedIndex];

  return {
    jstDate,
    lotteryVersion,
    rarityRoll,
    selectedRarity,
    fishRoll,
    fish: chosenFish,
  };
}
