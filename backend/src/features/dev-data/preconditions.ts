/**
 * Migrations supply the identity providers, db:seed supplies the public user that anonymous
 * submissions are attributed to. The generator needs both.
 */
import { listLoginIdentityProviders } from '../../core/db/repos/identityProviderRepo';
import { getPublicUser } from '../../core/services/publicUser';
import { ValidationError } from '../../core/errors';
import type { ResolvedUser } from './resolveUser';

const NOT_SEEDED = 'Database is not ready, run pnpm db:init first';

/** Asserts the base data is in place and returns the public user. */
export async function requireBaseSeed(): Promise<ResolvedUser> {
  const providers = await listLoginIdentityProviders();
  if (providers.length === 0) {
    throw new ValidationError(`${NOT_SEEDED} (no active login providers)`);
  }

  const publicUser = await getPublicUser();
  if (!publicUser) {
    throw new ValidationError(`${NOT_SEEDED} (no public user)`);
  }
  return { id: publicUser.id, displayLabel: publicUser.displayLabel };
}
