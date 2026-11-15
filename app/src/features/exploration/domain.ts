import { sha256Bytes } from '../../lib/sha256';
import placesData from './hidingPlaces.v1.json';

export type Position = { x: number; z: number; y?:number };
export type SearchMode = '2d' | '3d';
export type HidingPlace = typeof placesData[number] & {y?:number;medium?:'sea'|'river'|'air'};
export const PLACES = placesData;
export const HIDE_VERSION = 'hide-v1';
export const EXPLORATION_KEY = 'shinkai_exploration_v1';
export const START: Position = { x: -20, z: -190 };
export const BOUNDS = { minX: -500, maxX: 700, minZ: -2580, maxZ: 300 };
export const FIND_RADIUS = 20;
export type Discovery = { date: string; fishId: string; placeId: string; version: string; foundAt: string; mode: SearchMode };

/** IDs and ordering are frozen for hide-v1. Changing sites requires a new version. */
export function dailyPlace(date: string): HidingPlace {
  const bytes = sha256Bytes(`shinkai-exploration:${HIDE_VERSION}:${date}`);
  const value = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return PLACES[value % PLACES.length];
}
export function detector(position: Position, target: Position) {
  const dx = target.x - position.x, dz = target.z - position.z;
  const distance = Math.hypot(dx, dz);
  const bearing = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  return { distance, bearing, direction: Math.round(bearing / 45) % 8, near: distance <= FIND_RADIUS };
}
export function clampPosition(p: Position): Position {
  return { x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, p.x)), z: Math.max(BOUNDS.minZ, Math.min(BOUNDS.maxZ, p.z)) };
}
export function loadDiscovery(date: string, fishId: string, placeId: string, version=HIDE_VERSION): Discovery | null {
  try {
    const records: unknown = JSON.parse(localStorage.getItem(EXPLORATION_KEY) || '{}');
    if (!records || typeof records !== 'object' || Array.isArray(records)) return null;
    const r = (records as Record<string, Discovery>)[date];
    return r?.date === date && r.fishId === fishId && r.placeId === placeId && r.version === version &&
      (r.mode === '2d' || r.mode === '3d') && typeof r.foundAt === 'string' ? r : null;
  } catch { return null; }
}
export function saveDiscovery(record: Discovery): boolean {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPLORATION_KEY) || '{}');
    const records = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    localStorage.setItem(EXPLORATION_KEY, JSON.stringify({ ...records, [record.date]: record }));
    return true;
  } catch { return false; }
}
