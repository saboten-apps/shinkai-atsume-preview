import type { AreaDefinition, FishCatalogData, FishRecord } from '../types/schema';
import { APP_CONFIG } from '../config/appConfig';

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  targetId?: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * fish.json のスキーマとデータ整合性を検査する（T0-02）。
 * - ID重複、必須項目欠落、出典なし、不正なURL、レア度範囲外を error として検出する。
 * - needs_check: true や illustration 未設定（プレースホルダ使用）は warning として記録し、
 *   strictVerification=true を指定した場合は error として扱う。
 */
export function validateFishCatalog(
  catalog: FishCatalogData,
  options?: {
    expectedCount?: number;
    strictVerification?: boolean;
    knownAreaIds?: readonly string[];
  }
): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const expectedCount = options?.expectedCount ?? APP_CONFIG.lottery.totalFishCount;
  const strict = options?.strictVerification ?? false;

  if (!catalog || !Array.isArray(catalog.fish)) {
    errors.push({
      level: 'error',
      code: 'INVALID_ROOT',
      message: 'Catalog must contain a "fish" array.',
    });
    return { valid: false, errors, warnings };
  }

  if (catalog.fish.length !== expectedCount) {
    errors.push({
      level: 'error',
      code: 'FISH_COUNT_MISMATCH',
      message: `Expected ${expectedCount} fish entries, but found ${catalog.fish.length}.`,
    });
  }

  const seenIds = new Set<string>();
  const seenNamesJa = new Set<string>();

  catalog.fish.forEach((fish: FishRecord, index: number) => {
    const label = fish?.id || `index:${index}`;

    if (!fish.id || !/^[a-z0-9_-]+$/i.test(fish.id)) {
      errors.push({
        level: 'error',
        code: 'INVALID_FISH_ID',
        targetId: label,
        message: `Fish ID "${fish.id}" must be a non-empty ASCII identifier.`,
      });
    } else if (seenIds.has(fish.id)) {
      errors.push({
        level: 'error',
        code: 'DUPLICATE_FISH_ID',
        targetId: fish.id,
        message: `Duplicate fish ID "${fish.id}" detected.`,
      });
    } else {
      seenIds.add(fish.id);
    }

    if (!fish.name_ja || fish.name_ja.trim().length === 0) {
      errors.push({
        level: 'error',
        code: 'MISSING_NAME_JA',
        targetId: label,
        message: 'Japanese name (name_ja) is required.',
      });
    } else if (seenNamesJa.has(fish.name_ja)) {
      errors.push({
        level: 'error',
        code: 'DUPLICATE_NAME_JA',
        targetId: label,
        message: `Duplicate Japanese name "${fish.name_ja}" detected.`,
      });
    } else {
      seenNamesJa.add(fish.name_ja);
    }

    if (!Number.isInteger(fish.rarity) || fish.rarity < 1 || fish.rarity > 5) {
      errors.push({
        level: 'error',
        code: 'INVALID_RARITY',
        targetId: label,
        message: `Rarity must be an integer between 1 and 5 (got ${String(fish.rarity)}).`,
      });
    }

    if (!fish.depth_text || fish.depth_text.trim().length === 0) {
      errors.push({
        level: 'error',
        code: 'MISSING_DEPTH_TEXT',
        targetId: label,
        message: 'depth_text is required.',
      });
    }

    if (!fish.fact || fish.fact.trim().length === 0) {
      errors.push({
        level: 'error',
        code: 'MISSING_FACT',
        targetId: label,
        message: 'fact is required.',
      });
    }

    if (!Array.isArray(fish.sources) || fish.sources.length === 0) {
      errors.push({
        level: 'error',
        code: 'MISSING_SOURCES',
        targetId: label,
        message: 'At least one source URL is required in sources[].',
      });
    } else {
      fish.sources.forEach((src) => {
        if (!isHttpUrl(src)) {
          errors.push({
            level: 'error',
            code: 'INVALID_SOURCE_URL',
            targetId: label,
            message: `Invalid source URL "${src}".`,
          });
        }
      });
    }

    if (
      options?.knownAreaIds &&
      fish.area_hint &&
      !options.knownAreaIds.includes(fish.area_hint)
    ) {
      errors.push({
        level: 'error',
        code: 'UNKNOWN_AREA_HINT',
        targetId: label,
        message: `Unknown area_hint "${fish.area_hint}".`,
      });
    }

    if (fish.needs_check) {
      const issue: ValidationIssue = {
        level: strict ? 'error' : 'warning',
        code: 'NEEDS_CHECK',
        targetId: label,
        message: `Fish "${fish.name_ja}" (${label}) is marked needs_check=true.`,
      };
      if (strict) {
        errors.push(issue);
      } else {
        warnings.push(issue);
      }
    }

    if (!fish.illustration) {
      warnings.push({
        level: 'warning',
        code: 'PLACEHOLDER_ILLUSTRATION',
        targetId: label,
        message: `Fish "${fish.name_ja}" (${label}) has illustration=null; using placeholder.`,
      });
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * エリア案内定義を検査する（T0-02, T0-08）。
 * - 展示・提供を断定する禁止表現（「必ず会えます」「提供中です」「食べられます」等）が含まれていないかも検査する。
 */
const PROHIBITED_ASSERTION_PATTERNS = [
  /この魚が食べられ/,
  /必ず会え/,
  /提供中です/,
  /展示中です/,
  /常時提供/,
  /入荷中/,
];

export function validateAreas(areas: readonly AreaDefinition[]): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  if (!areas || areas.length === 0) {
    errors.push({
      level: 'error',
      code: 'EMPTY_AREAS',
      message: 'At least one area definition is required.',
    });
    return { valid: false, errors, warnings };
  }

  areas.forEach((area) => {
    if (!area.id) {
      errors.push({
        level: 'error',
        code: 'MISSING_AREA_ID',
        message: 'Area id is required.',
      });
    } else if (seenIds.has(area.id)) {
      errors.push({
        level: 'error',
        code: 'DUPLICATE_AREA_ID',
        targetId: area.id,
        message: `Duplicate area id "${area.id}".`,
      });
    } else {
      seenIds.add(area.id);
    }

    if (!isHttpUrl(area.officialUrl)) {
      errors.push({
        level: 'error',
        code: 'INVALID_OFFICIAL_URL',
        targetId: area.id,
        message: `Invalid officialUrl "${area.officialUrl}".`,
      });
    }

    if (!isHttpUrl(area.mapSearchUrl)) {
      errors.push({
        level: 'error',
        code: 'INVALID_MAP_URL',
        targetId: area.id,
        message: `Invalid mapSearchUrl "${area.mapSearchUrl}".`,
      });
    }

    for (const pattern of PROHIBITED_ASSERTION_PATTERNS) {
      if (pattern.test(area.description.ja)) {
        errors.push({
          level: 'error',
          code: 'PROHIBITED_ASSERTION_TEXT',
          targetId: area.id,
          message: `Area description contains prohibited availability assertion matching ${pattern}.`,
        });
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
