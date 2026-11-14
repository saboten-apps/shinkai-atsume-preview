import type { AreaDefinition } from '../types/schema';

/**
 * エリア案内定義（T0-08・ブリーフ6）
 * 沼津港エリア／戸田エリアの最小形定義。
 * 実在の店名・施設の展示/提供状況を断定する文は一切書かない。
 * コード内定数で管理し、後から差し替え可能にする。
 */
export const AREAS: readonly AreaDefinition[] = [
  {
    id: 'numazu-port',
    name: {
      ja: '沼津港エリア',
      en: 'Numazu Port Area',
    },
    description: {
      ja: '駿河湾北部に位置する港町エリア。深海魚の水揚げや周辺施設の観光案内は公式ポータルから確認できます。（※魚の展示・提供状況は各施設・店舗の当日の状況によります）',
      en: 'A port area located along northern Suruga Bay. Official tourism information and harbor guides can be referenced via the municipal portal. (*Availability of fish exhibits or dishes depends on each facility’s daily conditions.)',
    },
    officialLinkLabel: {
      ja: '沼津市公式観光サイト（沼津観光ポータル）',
      en: 'Numazu Official Tourism Portal',
    },
    officialUrl: 'https://numazukanko.jp/',
    mapSearchLabel: {
      ja: 'Google マップで「沼津港」を検索',
      en: 'Search "Numazu Port" on Google Maps',
    },
    mapSearchUrl: 'https://www.google.com/maps/search/?api=1&query=%E6%B2%BC%E6%B4%A5%E6%B8%AF',
    status: 'active',
    verifiedAt: '2026-11-09',
    expiresAt: '2027-11-09',
  },
  {
    id: 'heda',
    name: {
      ja: '戸田（へだ）エリア',
      en: 'Heda Area (Numazu)',
    },
    description: {
      ja: '駿河湾に面した西伊豆・戸田の港町エリア。底曳網漁や深海生物に関する地域資料・観光案内は観光協会公式サイトから確認できます。（※魚の展示・提供状況は各施設・店舗の当日の状況によります）',
      en: 'A coastal port area in Heda along western Suruga Bay. Regional information on deep-sea fishing and local guides can be referenced via the tourist association site. (*Availability of fish exhibits or dishes depends on each facility’s daily conditions.)',
    },
    officialLinkLabel: {
      ja: '戸田観光協会 公式トップ',
      en: 'Heda Tourist Association Official Site',
    },
    officialUrl: 'https://www.deep-heda.com/',
    mapSearchLabel: {
      ja: 'Google マップで「沼津市戸田」を検索',
      en: 'Search "Heda, Numazu" on Google Maps',
    },
    mapSearchUrl: 'https://www.google.com/maps/search/?api=1&query=%E6%B2%BC%E6%B4%A5%E5%B8%82%E6%88%B8%E7%94%B0',
    status: 'active',
    verifiedAt: '2026-11-09',
    expiresAt: '2027-11-09',
  },
] as const;

/**
 * 有効かつ有効期限内のエリア一覧を返す。
 * 期限切れ・停止中・未確認のリンクは除外する（設計書 150行目、T0-08）。
 */
export function getActiveAreas(
  currentJstDate: string,
  areas: readonly AreaDefinition[] = AREAS
): AreaDefinition[] {
  return areas.filter((area) => {
    if (area.status !== 'active') return false;
    if (!area.officialUrl.startsWith('https://') && !area.officialUrl.startsWith('http://')) {
      return false;
    }
    if (!area.mapSearchUrl.startsWith('https://') && !area.mapSearchUrl.startsWith('http://')) {
      return false;
    }
    if (area.expiresAt < currentJstDate) {
      return false;
    }
    return true;
  });
}
