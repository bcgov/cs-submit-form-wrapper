/**
 * Client-side mirror of the backend's SOBA platform-admin role check
 * (`src/plugins/idp-bcgov-sso`): the same claim shapes are accepted so the UI shows the
 * admin section exactly when the API would authorize it. The backend still enforces access —
 * this only decides what is offered in the UI.
 */

/** Role code that marks a SOBA platform admin in the IdP token. */
export const SOBA_ADMIN_ROLE = 'soba_admin';

type ParsedToken = {
  roles?: unknown;
  realm_access?: unknown;
  client_roles?: unknown;
} & Record<string, unknown>;

function includesAdminRole(value: unknown): boolean {
  return Array.isArray(value) && value.includes(SOBA_ADMIN_ROLE);
}

/** True when the parsed Keycloak token carries the `soba_admin` role in any supported claim. */
export function hasSobaAdminRole(parsedToken: ParsedToken | null | undefined): boolean {
  if (!parsedToken) return false;
  if (includesAdminRole(parsedToken.roles)) return true;
  const realmAccess = parsedToken.realm_access as { roles?: unknown } | undefined;
  if (includesAdminRole(realmAccess?.roles)) return true;
  return includesAdminRole(parsedToken.client_roles);
}
