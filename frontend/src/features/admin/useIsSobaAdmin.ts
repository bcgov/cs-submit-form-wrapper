'use client';

import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { hasSobaAdminRole } from '@/src/shared/auth/sobaAdmin';

/**
 * Whether the signed-in user carries the `soba_admin` role. Prefers the access token (where
 * Keycloak puts client/realm roles) and falls back to the id token mirrored in Redux.
 */
export function useIsSobaAdmin(): { isSobaAdmin: boolean; initializing: boolean } {
  const { keycloak, idTokenParsed, authenticated, initializing } = useKeycloak();

  const accessTokenParsed = keycloak?.tokenParsed as Record<string, unknown> | undefined;
  const isSobaAdmin =
    authenticated && (hasSobaAdminRole(accessTokenParsed) || hasSobaAdminRole(idTokenParsed));

  return { isSobaAdmin, initializing };
}
