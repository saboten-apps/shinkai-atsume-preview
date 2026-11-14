/**
 * 魚ID（f01〜f24）ごとのプレースホルダ視覚定義（ブリーフ30・設計書 237〜243行目）
 * - 深海の暗い背景＋魚ごとの発光アクセントカラー＋形態タイプ別のシルエット形状
 * - 実イラスト完成後にそのまま差し替えられるよう、設計書のファイル名規則（assets/fish/${id}.svg）も定義する。
 */

export type FishShapeType =
  | 'crab'       // カニ類（タカアシガニ、エゾイバラガニ）
  | 'octopus'    // メンダコ
  | 'shrimp'     // エビ類（サクラエビ、アカザエビ、ミノエビ、ボタンエビ、オオコシオリエビ）
  | 'shark'      // ラブカ・ギンザメ（ラブカ、アカギンザメ）
  | 'eel'        // ヌタウナギ
  | 'isopod'     // オオグソクムシ
  | 'angler'     // アンコウ類（ミドリフサアンコウ、アカグツ、キアンコウ）
  | 'viperfish'  // ホウライエソ・トウジン
  | 'deepfish';  // 一般深海魚（キンメダイ、アカムツ、アオメエソ、ニギス、ユメカサゴ、アブラボウズ、ハダカイワシ）

export interface FishVisualPlaceholder {
  id: string;
  accentColor: string;
  secondaryColor: string;
  shape: FishShapeType;
  /** 設計書の相対パス規則（実イラスト投入時の差し替え先） */
  illustrationFile: string;
}

export const FISH_VISUAL_MAP: Record<string, FishVisualPlaceholder> = {
  f01: { id: 'f01', accentColor: '#ff6b4a', secondaryColor: '#ffaa85', shape: 'crab', illustrationFile: 'assets/fish/f01.svg' },
  f02: { id: 'f02', accentColor: '#ff7eb6', secondaryColor: '#ffc2df', shape: 'octopus', illustrationFile: 'assets/fish/f02.svg' },
  f03: { id: 'f03', accentColor: '#ff8da1', secondaryColor: '#ffd1dc', shape: 'shrimp', illustrationFile: 'assets/fish/f03.svg' },
  f04: { id: 'f04', accentColor: '#ff5252', secondaryColor: '#ffd452', shape: 'deepfish', illustrationFile: 'assets/fish/f04.svg' },
  f05: { id: 'f05', accentColor: '#e056fd', secondaryColor: '#f9ca24', shape: 'deepfish', illustrationFile: 'assets/fish/f05.svg' },
  f06: { id: 'f06', accentColor: '#ff793f', secondaryColor: '#ffb142', shape: 'shrimp', illustrationFile: 'assets/fish/f06.svg' },
  f07: { id: 'f07', accentColor: '#70a1ff', secondaryColor: '#7bed9f', shape: 'shark', illustrationFile: 'assets/fish/f07.svg' },
  f08: { id: 'f08', accentColor: '#a29bfe', secondaryColor: '#dfe6e9', shape: 'eel', illustrationFile: 'assets/fish/f08.svg' },
  f09: { id: 'f09', accentColor: '#c8d6e5', secondaryColor: '#48dbfb', shape: 'isopod', illustrationFile: 'assets/fish/f09.svg' },
  f10: { id: 'f10', accentColor: '#1dd1a1', secondaryColor: '#48dbfb', shape: 'deepfish', illustrationFile: 'assets/fish/f10.svg' },
  f11: { id: 'f11', accentColor: '#54a0ff', secondaryColor: '#c8d6e5', shape: 'deepfish', illustrationFile: 'assets/fish/f11.svg' },
  f12: { id: 'f12', accentColor: '#ff6b6b', secondaryColor: '#feca57', shape: 'deepfish', illustrationFile: 'assets/fish/f12.svg' },
  f13: { id: 'f13', accentColor: '#5f27cd', secondaryColor: '#48dbfb', shape: 'deepfish', illustrationFile: 'assets/fish/f13.svg' },
  f14: { id: 'f14', accentColor: '#ff9ff3', secondaryColor: '#feca57', shape: 'shrimp', illustrationFile: 'assets/fish/f14.svg' },
  f15: { id: 'f15', accentColor: '#ff6348', secondaryColor: '#ffa502', shape: 'shrimp', illustrationFile: 'assets/fish/f15.svg' },
  f16: { id: 'f16', accentColor: '#ff9f43', secondaryColor: '#ff6b6b', shape: 'shrimp', illustrationFile: 'assets/fish/f16.svg' },
  f17: { id: 'f17', accentColor: '#ff4757', secondaryColor: '#7bed9f', shape: 'angler', illustrationFile: 'assets/fish/f17.svg' },
  f18: { id: 'f18', accentColor: '#ff6348', secondaryColor: '#eccc68', shape: 'angler', illustrationFile: 'assets/fish/f18.svg' },
  f19: { id: 'f19', accentColor: '#2ed573', secondaryColor: '#70a1ff', shape: 'viperfish', illustrationFile: 'assets/fish/f19.svg' },
  f20: { id: 'f20', accentColor: '#ff7f50', secondaryColor: '#f1f2f6', shape: 'crab', illustrationFile: 'assets/fish/f20.svg' },
  f21: { id: 'f21', accentColor: '#00d2d3', secondaryColor: '#54a0ff', shape: 'deepfish', illustrationFile: 'assets/fish/f21.svg' },
  f22: { id: 'f22', accentColor: '#0abde3', secondaryColor: '#1dd1a1', shape: 'viperfish', illustrationFile: 'assets/fish/f22.svg' },
  f23: { id: 'f23', accentColor: '#54a0ff', secondaryColor: '#5f27cd', shape: 'shark', illustrationFile: 'assets/fish/f23.svg' },
  f24: { id: 'f24', accentColor: '#feca57', secondaryColor: '#ff6b6b', shape: 'angler', illustrationFile: 'assets/fish/f24.svg' },
};

export function getFishVisual(fishId: string): FishVisualPlaceholder {
  return (
    FISH_VISUAL_MAP[fishId] ?? {
      id: fishId,
      accentColor: '#38bdf8',
      secondaryColor: '#818cf8',
      shape: 'deepfish',
      illustrationFile: `assets/fish/${fishId}.svg`,
    }
  );
}

/**
 * fish.json の illustration フィールド（例: "assets/fish/f01.webp"）を
 * Vite の BASE_URL を考慮した表示・読み込み用URLに解決する。
 * null または空文字の場合は null を返す（プレースホルダへフォールバック）。
 */
export function resolveIllustrationUrl(
  illustration: string | null | undefined
): string | null {
  if (!illustration || illustration.trim().length === 0) {
    return null;
  }
  const trimmed = illustration.trim();
  if (/^(https?:|data:|blob:|\/)/i.test(trimmed)) {
    return trimmed;
  }
  const metaEnv = (
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: { BASE_URL?: string } }).env
      : undefined
  );
  const baseUrl = metaEnv?.BASE_URL ?? './';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = trimmed.replace(/^\.?\//, '');
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * 形態タイプに応じたSVGパス（viewBox="0 0 240 120" 基準、左向き基本）
 */
export function getShapeSvgPaths(shape: FishShapeType): {
  bodyPath: string;
  detailPath: string;
  eyePos: { cx: number; cy: number };
} {
  switch (shape) {
    case 'crab':
      return {
        bodyPath:
          'M95,58 C95,38 145,38 145,58 C145,78 95,78 95,58 Z ' +
          'M98,50 L45,22 L28,45 M96,58 L35,58 L20,78 M98,66 L48,88 L35,108 ' +
          'M142,50 L195,22 L212,45 M144,58 L205,58 L220,78 M142,66 L192,88 L205,108',
        detailPath: 'M105,45 L95,28 M135,45 L145,28',
        eyePos: { cx: 112, cy: 48 },
      };
    case 'octopus':
      return {
        bodyPath:
          'M80,68 C80,30 160,30 160,68 C175,72 182,88 164,90 C150,92 142,82 132,90 C122,96 118,96 108,90 C98,82 90,92 76,90 C58,88 65,72 80,68 Z',
        detailPath:
          'M78,46 C56,34 52,54 76,58 M162,46 C184,34 188,54 164,58',
        eyePos: { cx: 102, cy: 62 },
      };
    case 'shrimp':
      return {
        bodyPath:
          'M55,62 L85,46 C125,42 162,50 182,68 L198,84 L176,88 L160,72 C135,66 105,66 80,72 Z',
        detailPath:
          'M55,60 C32,48 18,36 12,26 M55,64 C30,66 16,74 10,84 M95,72 L85,94 M115,70 L108,94 M135,70 L130,92',
        eyePos: { cx: 68, cy: 56 },
      };
    case 'shark':
      return {
        bodyPath:
          'M30,62 C55,44 105,42 165,54 L212,38 L198,62 L214,82 L165,68 C110,76 62,76 30,62 Z',
        detailPath:
          'M110,47 L128,28 L138,49 M72,54 L72,68 M80,54 L80,68 M88,54 L88,68',
        eyePos: { cx: 52, cy: 56 },
      };
    case 'eel':
      return {
        bodyPath:
          'M28,60 C58,38 98,78 138,54 C168,38 195,58 214,62 C195,74 168,56 138,70 C98,92 58,54 28,68 Z',
        detailPath: 'M24,58 L16,52 M24,64 L14,64 M24,68 L16,74',
        eyePos: { cx: 42, cy: 58 },
      };
    case 'isopod':
      return {
        bodyPath:
          'M52,64 C56,36 172,34 188,62 C192,76 174,84 152,82 L72,82 C56,82 48,74 52,64 Z',
        detailPath:
          'M85,42 L85,82 M108,40 L108,82 M132,40 L132,82 M155,44 L155,82 M52,64 L28,54 M52,68 L30,78',
        eyePos: { cx: 66, cy: 62 },
      };
    case 'angler':
      return {
        bodyPath:
          'M42,66 C48,34 128,30 162,54 L196,40 L190,64 L198,86 L162,72 C126,94 52,92 42,66 Z',
        detailPath:
          'M72,40 C58,18 36,20 32,38 M44,68 L68,72',
        eyePos: { cx: 66, cy: 54 },
      };
    case 'viperfish':
      return {
        bodyPath:
          'M34,58 C62,40 124,46 184,58 L210,44 L202,62 L212,78 L184,66 C124,76 64,80 34,66 Z',
        detailPath:
          'M92,46 C84,16 54,14 42,32 M38,60 L46,72 M46,60 L52,70',
        eyePos: { cx: 54, cy: 54 },
      };
    case 'deepfish':
    default:
      return {
        bodyPath:
          'M40,60 C68,34 134,36 172,56 L204,38 L194,60 L204,82 L172,66 C134,86 68,86 40,60 Z',
        detailPath:
          'M102,42 L126,26 L138,44 M106,76 L124,90 L136,76',
        eyePos: { cx: 66, cy: 55 },
      };
  }
}
