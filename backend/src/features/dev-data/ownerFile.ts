/**
 * Records a developer's real app_user and user_identity so a fresh database can be seeded without
 * signing in first. Gitignored: a subject is a staff identifier and this repo is public.
 *
 * The subject must be the real one. findOrCreateUserByIdentity matches on (provider, subject), so
 * a real subject is adopted on first sign-in; an invented one creates a second, empty user.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';

import type { NormalizedProfile } from '../../core/auth/jwtClaims';
import { db } from '../../core/db/client';
import { appUsers, userIdentities } from '../../core/db/schema';
import { findOrCreateUserByIdentity } from '../../core/db/repos/membershipRepo';
import { ConflictError, ValidationError } from '../../core/errors';
import { resolveProjectPath } from './paths';
import { DEV_SUBJECT_PREFIX } from './plan';
import { resolveTargetUser, type ResolvedUser, type UserRef } from './resolveUser';

/** Relative to the backend package, the CLI's working directory. */
export const DEFAULT_OWNER_FILE = '.devdata-owner';

export interface OwnerFile {
  /** For anyone opening the file. Not read back. */
  note: string;
  displayLabel: string | null;
  profile: NormalizedProfile | null;
  identity: {
    identityProviderCode: string;
    subject: string;
  };
}

const NOTE =
  'Real app_user + user_identity for local dev data. The subject must stay real so your ' +
  'first sign-in adopts this row. Do not commit.';

/** Reads the owner's rows from the database and shapes the file. */
export async function buildOwnerFile(ref: UserRef): Promise<OwnerFile> {
  const user = await resolveTargetUser(ref);

  const rows = await db
    .select({
      profile: appUsers.profile,
      identityProviderCode: userIdentities.identityProviderCode,
      subject: userIdentities.subject,
    })
    .from(appUsers)
    .innerJoin(userIdentities, eq(userIdentities.userId, appUsers.id))
    .where(eq(appUsers.id, user.id));

  if (rows.length === 0) {
    throw new ValidationError(
      `'${user.displayLabel ?? user.id}' has no user_identity row, so there is no subject to record`,
    );
  }
  if (rows.length > 1) {
    throw new ConflictError(
      `'${user.displayLabel ?? user.id}' has more than one identity; the owner file supports one`,
    );
  }

  const row = rows[0];
  if (!user.displayLabel) {
    throw new ValidationError(
      `'${user.id}' has no display_label, so --username could never match this owner file`,
    );
  }
  return {
    note: NOTE,
    displayLabel: user.displayLabel,
    // app_user.profile, not the raw token: no need to write a full claim set to disk.
    profile: (row.profile as NormalizedProfile | null) ?? null,
    identity: { identityProviderCode: row.identityProviderCode, subject: row.subject },
  };
}

export async function writeOwnerFile(path: string, owner: OwnerFile): Promise<void> {
  // 0600: the file holds a real subject, name, and email.
  const target = resolveProjectPath(path);
  await writeFile(target, `${JSON.stringify(owner, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

/** Null when the file is absent. A malformed file is an error, not a silent fallback. */
export async function readOwnerFile(path: string): Promise<OwnerFile | null> {
  const target = resolveProjectPath(path);
  let raw: string;
  try {
    raw = await readFile(target, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const parsed = JSON.parse(raw) as Partial<OwnerFile>;
  const subject = parsed.identity?.subject;
  const providerCode = parsed.identity?.identityProviderCode;
  if (!subject || !providerCode) {
    throw new ValidationError(
      `${path} is missing identity.subject or identity.identityProviderCode`,
    );
  }
  return {
    note: parsed.note ?? NOTE,
    displayLabel: parsed.displayLabel ?? null,
    profile: parsed.profile ?? null,
    identity: { identityProviderCode: providerCode, subject },
  };
}

/**
 * Creates the recorded user if absent, returns them either way. Uses the same lookup-or-create as
 * the sign-in path, so the provider must be an active login provider.
 */
export async function ensureOwner(owner: OwnerFile): Promise<ResolvedUser> {
  // A generated subject here would make the owner a user purge deletes, and dev_data_run's
  // owner_user_id would then block that delete for good.
  if (owner.identity.subject.startsWith(DEV_SUBJECT_PREFIX)) {
    throw new ValidationError(
      `${DEFAULT_OWNER_FILE} records a generated identity; it must name a real user`,
    );
  }

  const profile: NormalizedProfile = { ...owner.profile };
  if (owner.displayLabel && !profile.displayLabel) {
    profile.displayLabel = owner.displayLabel;
  }

  const id = await findOrCreateUserByIdentity(
    owner.identity.identityProviderCode,
    owner.identity.subject,
    profile,
  );
  return { id, displayLabel: owner.displayLabel };
}

/** True when the named user is the person the file records. */
export function ownerFileMatches(owner: OwnerFile, username: string): boolean {
  return (owner.displayLabel ?? '').toLowerCase() === username.toLowerCase();
}
