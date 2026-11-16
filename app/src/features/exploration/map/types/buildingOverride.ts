/**
 * BuildingOverride Type Definitions & Schema Validation
 *
 * Implements Stage 2 Specification (NEXT-DEVELOPMENT-DESIGN.md §3, §8).
 * Ensures strict separation between internal review data and public distribution data.
 */

export type OverrideOperation = 'appearance' | 'replace' | 'hide' | 'add';
export type OverrideStatus = 'draft' | 'verified' | 'published' | 'retired';

export const VALID_OPERATIONS: readonly OverrideOperation[] = ['appearance', 'replace', 'hide', 'add'] as const;
export const VALID_STATUSES: readonly OverrideStatus[] = ['draft', 'verified', 'published', 'retired'] as const;

export const PRIVATE_FIELD_KEYS = [
  'contactInfo',
  'consentText',
  'rawPhotoGps',
  'internalNotes',
  'phone',
  'email',
  'authorRealName',
  'confidential'
] as const;

export interface InternalContactInfo {
  name: string;
  email?: string;
  phone?: string;
  organization?: string;
}

export interface InternalRawPhotoGps {
  lat: number;
  lon: number;
  altitude?: number;
  accuracyMeters?: number;
}

/**
 * 内部管理用 BuildingOverride エンティティ
 * 連絡先、同意文原文、撮影GPS等の内部レビュー用情報を含む。
 */
export interface BuildingOverrideInternal {
  overrideId: string;
  buildingKey: string;
  chunkId: string;
  sourceVersion: string;
  operation: OverrideOperation;
  assetRef?: string | null;
  reason: string;
  verifiedAt: string; // ISO date YYYY-MM-DD
  revision: number;
  status: OverrideStatus;
  // 内部専用フィールド（公開JSONには含めない）
  contactInfo?: InternalContactInfo;
  consentText?: string;
  rawPhotoGps?: InternalRawPhotoGps;
  internalNotes?: string;
}

/**
 * 公開配信版 BuildingOverride エンティティ
 * 個人情報や機密内部情報を完全に除外した軽量配信構造。
 */
export interface BuildingOverridePublic {
  overrideId: string;
  buildingKey: string;
  chunkId: string;
  sourceVersion: string;
  operation: OverrideOperation;
  assetRef?: string | null;
  reason: string;
  verifiedAt: string;
  revision: number;
  status: OverrideStatus;
}

/**
 * 版管理用 ReleaseManifest エンティティ
 * 原本版 (sourceVersion) と修正台帳 (overrides) の組合せを releaseId で固定。
 */
export interface ReleaseManifest {
  releaseId: string;
  sourceVersion: string;
  updatedAt: string;
  description: string;
  overrides: BuildingOverridePublic[];
  chunkOverrides?: Record<string, {
    chunkId: string;
    regeneratedUrl?: string;
    overrideIds: string[];
  }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * ISO日付文字列 (YYYY-MM-DD) の形式チェック
 */
export function isValidIsoDate(str: string): boolean {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

/**
 * 内部用 BuildingOverride のバリデーション
 */
export function validateInternalOverride(item: unknown): ValidationResult {
  const errors: string[] = [];
  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Item must be an object'] };
  }

  const rec = item as Partial<BuildingOverrideInternal>;

  if (!rec.overrideId || typeof rec.overrideId !== 'string' || rec.overrideId.trim() === '') {
    errors.push('overrideId must be a non-empty string');
  }
  if (!rec.buildingKey || typeof rec.buildingKey !== 'string' || rec.buildingKey.trim() === '') {
    errors.push('buildingKey must be a non-empty string');
  }
  if (!rec.chunkId || typeof rec.chunkId !== 'string' || rec.chunkId.trim() === '') {
    errors.push('chunkId must be a non-empty string');
  }
  if (!rec.sourceVersion || typeof rec.sourceVersion !== 'string' || rec.sourceVersion.trim() === '') {
    errors.push('sourceVersion must be a non-empty string');
  }
  if (!rec.operation || !VALID_OPERATIONS.includes(rec.operation as OverrideOperation)) {
    errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
  }
  if (!rec.reason || typeof rec.reason !== 'string' || rec.reason.trim() === '') {
    errors.push('reason must be a non-empty string');
  }
  if (!rec.verifiedAt || !isValidIsoDate(rec.verifiedAt)) {
    errors.push('verifiedAt must be a valid ISO date string (YYYY-MM-DD)');
  }
  if (typeof rec.revision !== 'number' || rec.revision < 1 || !Number.isInteger(rec.revision)) {
    errors.push('revision must be a positive integer');
  }
  if (!rec.status || !VALID_STATUSES.includes(rec.status as OverrideStatus)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  // 内部専用フィールドの個別整合性検査（存在する場合）
  if (rec.rawPhotoGps) {
    if (typeof rec.rawPhotoGps.lat !== 'number' || rec.rawPhotoGps.lat < -90 || rec.rawPhotoGps.lat > 90) {
      errors.push('rawPhotoGps.lat must be a number between -90 and 90');
    }
    if (typeof rec.rawPhotoGps.lon !== 'number' || rec.rawPhotoGps.lon < -180 || rec.rawPhotoGps.lon > 180) {
      errors.push('rawPhotoGps.lon must be a number between -180 and 180');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * オブジェクト内に公開禁止の内部専用キーが含まれていないか検出
 */
export function detectPrivateFieldLeakage(item: unknown): string[] {
  if (!item || typeof item !== 'object') return [];
  const found: string[] = [];
  const obj = item as Record<string, unknown>;

  for (const key of PRIVATE_FIELD_KEYS) {
    if (key in obj && obj[key] !== undefined) {
      found.push(key);
    }
  }

  // 再帰チェック
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = detectPrivateFieldLeakage(v);
      for (const n of nested) found.push(`${k}.${n}`);
    }
  }

  return found;
}

/**
 * 公開配信版 BuildingOverride のバリデーション
 * 内部専用フィールドの漏洩がないこと、および配信必須項目が満たされていることを厳格検証
 */
export function validatePublicOverride(item: unknown): ValidationResult {
  const errors: string[] = [];
  if (!item || typeof item !== 'object') {
    return { valid: false, errors: ['Item must be an object'] };
  }

  const leaks = detectPrivateFieldLeakage(item);
  if (leaks.length > 0) {
    errors.push(`Private internal fields leaked into public override: ${leaks.join(', ')}`);
  }

  const rec = item as Partial<BuildingOverridePublic>;

  if (!rec.overrideId || typeof rec.overrideId !== 'string' || rec.overrideId.trim() === '') {
    errors.push('overrideId must be a non-empty string');
  }
  if (!rec.buildingKey || typeof rec.buildingKey !== 'string' || rec.buildingKey.trim() === '') {
    errors.push('buildingKey must be a non-empty string');
  }
  if (!rec.chunkId || typeof rec.chunkId !== 'string' || rec.chunkId.trim() === '') {
    errors.push('chunkId must be a non-empty string');
  }
  if (!rec.sourceVersion || typeof rec.sourceVersion !== 'string' || rec.sourceVersion.trim() === '') {
    errors.push('sourceVersion must be a non-empty string');
  }
  if (!rec.operation || !VALID_OPERATIONS.includes(rec.operation as OverrideOperation)) {
    errors.push(`operation must be one of: ${VALID_OPERATIONS.join(', ')}`);
  }
  if (!rec.reason || typeof rec.reason !== 'string' || rec.reason.trim() === '') {
    errors.push('reason must be a non-empty string');
  }
  if (!rec.verifiedAt || !isValidIsoDate(rec.verifiedAt)) {
    errors.push('verifiedAt must be a valid ISO date string (YYYY-MM-DD)');
  }
  if (typeof rec.revision !== 'number' || rec.revision < 1 || !Number.isInteger(rec.revision)) {
    errors.push('revision must be a positive integer');
  }
  if (rec.status !== 'published' && rec.status !== 'retired') {
    errors.push(`Public override status must be 'published' or 'retired', found: ${rec.status}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * ReleaseManifest のバリデーション
 */
export function validateReleaseManifest(manifest: unknown): ValidationResult {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const m = manifest as Partial<ReleaseManifest>;
  if (!m.releaseId || typeof m.releaseId !== 'string' || m.releaseId.trim() === '') {
    errors.push('releaseId must be a non-empty string');
  }
  if (!m.sourceVersion || typeof m.sourceVersion !== 'string' || m.sourceVersion.trim() === '') {
    errors.push('sourceVersion must be a non-empty string');
  }
  if (!m.updatedAt || !isValidIsoDate(m.updatedAt)) {
    errors.push('updatedAt must be a valid ISO date string (YYYY-MM-DD)');
  }
  if (!Array.isArray(m.overrides)) {
    errors.push('overrides must be an array');
  } else {
    m.overrides.forEach((ovr, idx) => {
      const res = validatePublicOverride(ovr);
      if (!res.valid) {
        errors.push(`Override[${idx}] invalid: ${res.errors.join('; ')}`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

/**
 * 内部管理用データ配列から公開用 ReleaseManifest を生成（内部専用フィールドを不可逆的に除去）
 */
export function exportPublicReleaseManifest(
  internals: BuildingOverrideInternal[],
  releaseId: string,
  sourceVersion: string,
  description: string,
  updatedAt: string = '2026-11-15'
): ReleaseManifest {
  // published のみのレコードを抽出
  const publishedInternals = internals.filter(i => i.status === 'published' || i.status === 'retired');

  const publicOverrides: BuildingOverridePublic[] = publishedInternals.map(internal => {
    // 内部フィールドを確実に除外するため、公開許可プロパティのみをホワイトリスト形式でコピー
    return {
      overrideId: internal.overrideId,
      buildingKey: internal.buildingKey,
      chunkId: internal.chunkId,
      sourceVersion: internal.sourceVersion,
      operation: internal.operation,
      assetRef: internal.assetRef ?? null,
      reason: internal.reason,
      verifiedAt: internal.verifiedAt,
      revision: internal.revision,
      status: internal.status
    };
  });

  const manifest: ReleaseManifest = {
    releaseId,
    sourceVersion,
    updatedAt,
    description,
    overrides: publicOverrides
  };

  const validation = validateReleaseManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Exported manifest failed validation: ${validation.errors.join(', ')}`);
  }

  return manifest;
}
