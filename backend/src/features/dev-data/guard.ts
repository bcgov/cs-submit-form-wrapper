/**
 * Generating and purging are gated on the `dev-data` feature, the same gate an HTTP route would
 * use. Its status is disabled by migration and set per environment with FEATURE_DEV_DATA_STATUS,
 * which seed applies. Read uncached, so a CLI run sees the current status.
 */
import { sql } from 'drizzle-orm';

import { env } from '../../core/config/env';
import { db } from '../../core/db/client';
import { Features } from '../../core/db/codes';
import { featureEnvName } from '../../core/db/featureFlags';
import { getFeatureByCode, isFeatureEnabled } from '../../core/db/repos/featureRepo';
import { ConflictError, ForbiddenError } from '../../core/errors';

/** Second int for `pg_advisory_lock`; must not collide with the repo lock ids. */
const ADV_LOCK_DEV_DATA = 1_942_003_117;

/** Host and database from DATABASE_URL, for echoing before a destructive step. No credentials. */
export function describeTarget(): string {
  try {
    const parsed = new URL(env.getDatabaseUrl());
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/** Runs only when the feature's status is `enabled`; every other status is a refusal. */
/**
 * Session lock held for the whole command. Generating and purging both walk the run rows, and a
 * purge that lands mid-generate marks the live run purged, hiding everything it records after that.
 * Released when the connection closes.
 */
export async function acquireDevDataLock(): Promise<void> {
  const result = await db.execute(
    sql`select pg_try_advisory_lock(hashtext('soba-dev-data'::text), ${ADV_LOCK_DEV_DATA}) as locked`,
  );
  const locked = (result.rows[0] as { locked?: boolean } | undefined)?.locked;
  if (!locked) {
    throw new ConflictError('Another dev data command is running against this database');
  }
}

export async function assertDevDataEnabled(): Promise<void> {
  const feature = await getFeatureByCode(Features.dev_data);
  if (feature && isFeatureEnabled(feature.status)) return;

  // Naming the current status matters now that it can be experimental or deprecated, not just off.
  const current = feature ? `status '${feature.status}'` : 'no feature row';
  throw new ForbiddenError(
    `The ${Features.dev_data} feature has ${current} for ${describeTarget()}. ` +
      `Set ${featureEnvName(Features.dev_data)}=enabled and run pnpm db:seed.`,
  );
}
