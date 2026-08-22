/**
 * Per-environment feature status, applied at seed time.
 *
 * Migrations set the same status everywhere, so an environment that wants a different one says so
 * with `FEATURE_<CODE>_STATUS`, holding any value the feature_status table accepts. Unset or empty
 * means no opinion: the row stands as the migration wrote it.
 */
import { eq } from 'drizzle-orm';
import { db } from './client';
import { featureStatus, features } from './schema';
import { ValidationError } from '../errors';
import type { EnvSource } from '../config/env';

const PREFIX = 'FEATURE_';
const SUFFIX = '_STATUS';

/** `dev-data` -> `FEATURE_DEV_DATA_STATUS`. */
export const featureEnvName = (code: string): string =>
  `${PREFIX}${code.toUpperCase().replace(/[^A-Z0-9]/g, '_')}${SUFFIX}`;

/** The status this environment asks for, or undefined when it has no opinion. */
export function readFeatureStatus(source: EnvSource, code: string): string | undefined {
  const raw = source[featureEnvName(code)];
  if (raw === undefined || raw.trim() === '') return undefined;
  return raw.trim().toLowerCase();
}

export interface FeatureFlagChange {
  code: string;
  from: string;
  to: string;
}

/** Names that look like a feature flag but match no feature row, so a typo is not silent. */
export function unmatchedFlagNames(source: EnvSource, codes: string[]): string[] {
  return Object.keys(source)
    .filter((key) => key.startsWith(PREFIX) && key.endsWith(SUFFIX))
    .filter((key) => !codes.map(featureEnvName).includes(key))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Statuses to write: only where the environment asks for something the row does not already have.
 * An unrecognised status stops the run rather than leaving the environment quietly wrong.
 */
export function planFeatureFlagChanges(
  source: EnvSource,
  rows: Array<{ code: string; status: string }>,
  validStatuses: string[],
): FeatureFlagChange[] {
  const changes: FeatureFlagChange[] = [];
  for (const row of rows) {
    const wanted = readFeatureStatus(source, row.code);
    if (wanted === undefined || wanted === row.status) continue;
    if (!validStatuses.includes(wanted)) {
      throw new ValidationError(
        `${featureEnvName(row.code)}='${wanted}' is not a feature status. Use one of: ${validStatuses.join(', ')}.`,
      );
    }
    changes.push({ code: row.code, from: row.status, to: wanted });
  }
  return changes;
}

/** Applies the environment's feature statuses. Returns what changed, for the caller to report. */
export async function applyFeatureFlags(
  source: EnvSource,
  stampedBy: string,
): Promise<{ changes: FeatureFlagChange[]; unmatched: string[] }> {
  const rows = await db.select({ code: features.code, status: features.status }).from(features);
  const statusRows = await db
    .selectDistinct({ code: featureStatus.code })
    .from(featureStatus)
    .where(eq(featureStatus.isActive, true));
  const changes = planFeatureFlagChanges(
    source,
    rows,
    statusRows.map((r) => r.code),
  );

  for (const change of changes) {
    await db
      .update(features)
      .set({ status: change.to, updatedAt: new Date(), updatedBy: stampedBy })
      .where(eq(features.code, change.code));
  }

  return {
    changes,
    unmatched: unmatchedFlagNames(
      source,
      rows.map((r) => r.code),
    ),
  };
}
