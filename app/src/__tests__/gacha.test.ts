import { describe, expect, it } from 'vitest';
import rawFishCatalog from '../../data/fish.json';
import {
  drawDailyFish,
  getJstDateString,
  isValidDateString,
  selectRarityFromRoll,
} from '../lib/gacha';
import { hashToUnitFloat, sha256Hex } from '../lib/sha256';
import type { FishCatalogData } from '../types/schema';

const catalog = rawFishCatalog as unknown as FishCatalogData;

describe('SHA-256 & hashToUnitFloat determinism', () => {
  it('matches NIST FIPS 180-4 standard SHA-256 test vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('produces unit floats strictly in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const u = hashToUnitFloat(`seed-${i}`);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
    }
  });
});

describe('getJstDateString & midnight JST boundary (T0-05)', () => {
  it('handles exact midnight boundary in Asia/Tokyo (UTC+9)', () => {
    // 2026-11-08 23:59:59.999 JST === 2026-11-08 14:59:59.999 UTC
    const justBeforeMidnightJst = new Date('2026-11-08T14:59:59.999Z');
    // 2026-11-09 00:00:00.000 JST === 2026-11-08 15:00:00.000 UTC
    const exactMidnightJst = new Date('2026-11-08T15:00:00.000Z');
    // 2026-11-09 23:59:59.999 JST === 2026-11-09 14:59:59.999 UTC
    const endOfNov9Jst = new Date('2026-11-09T14:59:59.999Z');
    // 2026-11-10 00:00:00.000 JST === 2026-11-09 15:00:00.000 UTC
    const startOfNov10Jst = new Date('2026-11-09T15:00:00.000Z');

    expect(getJstDateString(justBeforeMidnightJst)).toBe('2026-11-08');
    expect(getJstDateString(exactMidnightJst)).toBe('2026-11-09');
    expect(getJstDateString(endOfNov9Jst)).toBe('2026-11-09');
    expect(getJstDateString(startOfNov10Jst)).toBe('2026-11-10');
  });

  it('handles year-end and leap-year boundaries in JST', () => {
    // 2026-12-31 23:59:59.999 JST -> 2027-01-01 00:00:00.000 JST
    expect(getJstDateString(new Date('2026-12-31T14:59:59.999Z'))).toBe('2026-12-31');
    expect(getJstDateString(new Date('2026-12-31T15:00:00.000Z'))).toBe('2027-01-01');

    // 2028 is a leap year: Feb 29 in JST
    expect(getJstDateString(new Date('2028-02-28T14:59:59.999Z'))).toBe('2028-02-28');
    expect(getJstDateString(new Date('2028-02-28T15:00:00.000Z'))).toBe('2028-02-29');
  });

  it('validates date strings properly', () => {
    expect(isValidDateString('2026-11-09')).toBe(true);
    expect(isValidDateString('2026-02-30')).toBe(false);
    expect(isValidDateString('2026/11/09')).toBe(false);
  });
});

describe('selectRarityFromRoll boundary rules (Design Doc L51)', () => {
  it('includes lower bound and excludes upper bound for each rarity tier', () => {
    // ★1: [0.00, 0.40)
    expect(selectRarityFromRoll(0.0)).toBe(1);
    expect(selectRarityFromRoll(0.399999)).toBe(1);

    // ★2: [0.40, 0.65)
    expect(selectRarityFromRoll(0.4)).toBe(2);
    expect(selectRarityFromRoll(0.649999)).toBe(2);

    // ★3: [0.65, 0.85)
    expect(selectRarityFromRoll(0.65)).toBe(3);
    expect(selectRarityFromRoll(0.849999)).toBe(3);

    // ★4: [0.85, 0.95)
    expect(selectRarityFromRoll(0.85)).toBe(4);
    expect(selectRarityFromRoll(0.949999)).toBe(4);

    // ★5: [0.95, 1.00)
    expect(selectRarityFromRoll(0.95)).toBe(5);
    expect(selectRarityFromRoll(0.999999)).toBe(5);
  });
});

describe('drawDailyFish deterministic lottery (T0-05)', () => {
  it('returns the exact same fish for the same JST date across repeated calls', () => {
    const first = drawDailyFish('2026-11-09', catalog.fish);
    const second = drawDailyFish('2026-11-09', catalog.fish);
    expect(second).toEqual(first);
  });

  it('is completely independent of the ordering of fish inside fish.json', () => {
    const reversedFish = [...catalog.fish].reverse();
    const normalDraw = drawDailyFish('2026-11-09', catalog.fish);
    const reversedDraw = drawDailyFish('2026-11-09', reversedFish);
    expect(reversedDraw.fish.id).toBe(normalDraw.fish.id);
    expect(reversedDraw.selectedRarity).toBe(normalDraw.selectedRarity);
  });

  it('switches the seed deterministically across the JST midnight boundary', () => {
    const beforeMidnight = getJstDateString(new Date('2026-11-08T14:59:59.999Z'));
    const afterMidnight = getJstDateString(new Date('2026-11-08T15:00:00.000Z'));

    const drawNov8 = drawDailyFish(beforeMidnight, catalog.fish);
    const drawNov9 = drawDailyFish(afterMidnight, catalog.fish);

    expect(drawNov8.jstDate).toBe('2026-11-08');
    expect(drawNov9.jstDate).toBe('2026-11-09');
    expect(drawNov8.rarityRoll).not.toBe(drawNov9.rarityRoll);
  });

  it('matches fixed expected outcomes table for specific reference dates', () => {
    const expectedTable: Array<{ date: string; fishId: string; rarity: number }> = [
      { date: '2026-11-09', fishId: 'f10', rarity: 1 },
      { date: '2026-11-10', fishId: 'f05', rarity: 3 },
      { date: '2026-11-11', fishId: 'f10', rarity: 1 },
      { date: '2026-11-12', fishId: 'f11', rarity: 1 },
      { date: '2026-11-13', fishId: 'f17', rarity: 3 },
    ];
    for (const row of expectedTable) {
      const actual = drawDailyFish(row.date, catalog.fish);
      expect(actual.fish.id).toBe(row.fishId);
      expect(actual.selectedRarity).toBe(row.rarity);
    }
  });

  it('draws all 24 species across a 365-day continuous schedule check (Design Doc L84)', () => {
    const appearedFishIds = new Set<string>();
    const startUtc = Date.UTC(2026, 10, 9, 3, 0, 0); // 2026-11-09 12:00 JST

    for (let dayOffset = 0; dayOffset < 365; dayOffset++) {
      const dateStr = getJstDateString(startUtc + dayOffset * 86400 * 1000);
      const result = drawDailyFish(dateStr, catalog.fish);
      appearedFishIds.add(result.fish.id);
    }

    expect(appearedFishIds.size).toBe(24);
  });
});
