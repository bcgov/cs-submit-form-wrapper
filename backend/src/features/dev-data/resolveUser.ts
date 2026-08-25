import { eq, sql } from 'drizzle-orm';
import { db } from '../../core/db/client';
import { appUsers, userIdentities } from '../../core/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { DEV_SUBJECT_PREFIX } from './plan';

/** How the caller names the user the data is built around. */
export type UserRef = { userId: string } | { username: string };

export interface ResolvedUser {
  id: string;
  displayLabel: string | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function byId(userId: string): Promise<ResolvedUser> {
  if (!UUID_PATTERN.test(userId)) {
    throw new NotFoundError(`'${userId}' is not a user id`);
  }
  const rows = await db
    .select({ id: appUsers.id, displayLabel: appUsers.displayLabel })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  if (!rows[0]) throw new NotFoundError(`No user with id '${userId}'`);
  return rows[0];
}

/**
 * app_user.display_label holds the IdP username (idir_username or bceid_username). Matched
 * case-insensitively. The row only exists once the user has signed in.
 */
async function byUsername(username: string): Promise<ResolvedUser> {
  const rows = await db
    .select({ id: appUsers.id, displayLabel: appUsers.displayLabel })
    .from(appUsers)
    .where(sql`lower(${appUsers.displayLabel}) = lower(${username})`)
    .limit(2);

  if (rows.length === 0) {
    throw new NotFoundError(
      `No user with username '${username}'. They must sign in once before dev data can be built around them.`,
    );
  }
  if (rows.length > 1) {
    throw new ConflictError(
      `More than one user matches username '${username}'; pass userId instead`,
    );
  }
  return rows[0];
}

/**
 * Generated users cannot be the owner: purge deletes them, and dev_data_run.owner_user_id would
 * hold the delete back.
 */
async function assertNotGenerated(user: ResolvedUser): Promise<void> {
  const rows = await db
    .select({ subject: userIdentities.subject })
    .from(userIdentities)
    .where(eq(userIdentities.userId, user.id));
  if (rows.some((r) => r.subject.startsWith(DEV_SUBJECT_PREFIX))) {
    throw new ValidationError(
      `'${user.displayLabel ?? user.id}' is a generated user; name a real one`,
    );
  }
}

export const resolveTargetUser = async (ref: UserRef): Promise<ResolvedUser> => {
  const user = await ('userId' in ref ? byId(ref.userId) : byUsername(ref.username));
  await assertNotGenerated(user);
  return user;
};
