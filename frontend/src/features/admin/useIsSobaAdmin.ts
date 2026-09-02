'use client';

import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useCurrentUser } from '@/src/shared/api/useCurrentUser';

/**
 * Whether the signed-in user is a SOBA platform admin, as reported by `GET /me`. The token's
 * `soba_admin` role is not enough: the backend authorizes against the `soba_admin` table, and a
 * grant added directly never appears in a token.
 *
 * `initializing` covers the current-user fetch, so callers show a loading state rather than a
 * forbidden one while the answer is unknown.
 */
export function useIsSobaAdmin(): { isSobaAdmin: boolean; initializing: boolean } {
  const { authenticated, initializing } = useKeycloak();
  const { data, loaded } = useCurrentUser();

  return {
    isSobaAdmin: authenticated && data?.capabilities?.isSobaAdmin === true,
    initializing: initializing || (authenticated && !loaded),
  };
}
