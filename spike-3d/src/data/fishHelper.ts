import { Fish } from '../types';
import rawFishData from '../../../app/data/fish.json';

interface FishJsonStructure {
  fish: Fish[];
}

const fishMap: Map<string, Fish> = new Map();

try {
  const data = rawFishData as unknown as FishJsonStructure;
  if (data && Array.isArray(data.fish)) {
    data.fish.forEach((f) => {
      fishMap.set(f.id, f);
    });
  }
} catch (err) {
  console.warn('Failed to load rawFishData directly, using fallback', err);
}

// フォールバック（主要5種）
const FALLBACK_FISH: Record<string, Fish> = {
  f01: {
    id: 'f01',
    name_ja: 'タカアシガニ',
    name_alias: null,
    scientific_name: 'Macrocheira kaempferi',
    scientific_name_note: null,
    name_en: 'Japanese spider crab',
    depth_text: '200–800',
    fact: '脚を広げると3m超、世界最大の甲殻類。静岡県沿岸の重要水産資源',
    eat_or_display_note: '食用あり（沼津で「高足ガニ天丼」等）／展示あり（沼津港深海水族館の常設種として紹介例あり）',
    rarity: 5,
    illustration: 'assets/fish/f01.webp',
    sources: [],
    needs_check: false
  },
  f02: {
    id: 'f02',
    name_ja: 'メンダコ',
    name_alias: null,
    scientific_name: 'Opisthoteuthis depressa',
    scientific_name_note: null,
    name_en: 'Japanese pancake devilfish',
    depth_text: '200–1,000',
    fact: '耳のようなヒレをパタパタさせて泳ぐ「深海のアイドル」。墨を持たない',
    eat_or_display_note: '食用 不明／展示あり（沼津港深海水族館）',
    rarity: 5,
    illustration: 'assets/fish/f02.webp',
    sources: [],
    needs_check: false
  },
  f03: {
    id: 'f03',
    name_ja: 'サクラエビ',
    name_alias: null,
    scientific_name: 'Lucensosergia lucens',
    scientific_name_note: null,
    name_en: 'Sakura shrimp',
    depth_text: '昼間 200–350（夜間は20–60まで浮上）',
    fact: '日本で漁業が行われているのは駿河湾のみ。発光器を多数持ち「海の宝石」と呼ばれる',
    eat_or_display_note: '食用あり／展示なし',
    rarity: 4,
    illustration: 'assets/fish/f03.webp',
    sources: [],
    needs_check: false
  },
  f04: {
    id: 'f04',
    name_ja: 'シーラカンス',
    name_alias: null,
    scientific_name: 'Latimeria chalumnae',
    scientific_name_note: null,
    name_en: 'Coelacanth',
    depth_text: '150–400',
    fact: '「生きた化石」の代表格。沼津港深海水族館で冷凍標本・剥製を常設展示',
    eat_or_display_note: '展示あり（沼津港深海水族館：世界唯一の冷凍個体2体＋剥製3体を常設展示）',
    rarity: 5,
    illustration: 'assets/fish/f04.webp',
    sources: [],
    needs_check: false
  },
  f06: {
    id: 'f06',
    name_ja: 'アブラボウズ',
    name_alias: null,
    scientific_name: 'Erilepis zonifer',
    scientific_name_note: null,
    name_en: 'Skilfish',
    depth_text: '200–1,000',
    fact: '体長1m超・体重数十kgに達する巨大深海魚。「オオクチイシナギ」と並ぶ深海の大物',
    eat_or_display_note: '食用あり（刺身・煮付け）／展示あり',
    rarity: 4,
    illustration: 'assets/fish/f06.webp',
    sources: [],
    needs_check: false
  }
};

export function getFishById(id: string): Fish | undefined {
  return fishMap.get(id) || FALLBACK_FISH[id];
}
