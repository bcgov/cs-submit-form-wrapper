/**
 * Resolves req.actorId from the JWT (via IdP plugins).
 * Refreshes soba_admin from IdP when the mapper returns sobaAdmin, then sets req.isSobaAdmin.
 * Must run after checkJwt() so that req.idpPluginCode and req.authPayload are set.
 */
import { Request, Response, NextFunction } from 'express';
import { getIdpPlugins } from '../auth/idpRegistry';
import type { CallerIdentity } from '../db/repos/formSubmitAccessRepo';
import { findOrCreateUserByIdentity } from '../db/repos/membershipRepo';
import { isSobaAdmin, upsertSobaAdminFromIdp } from '../db/repos/sobaAdminRepo';
import { ValidationError } from '../errors';
import { profileHelpers } from '../auth/jwtClaims';
import { getPublicUser } from '../services/publicUser';
import { PUBLIC_PROVIDER_CODE } from '../db/codes';

/**
 * Read the actor id resolved by resolveActor.
 * Used by actor-only routes that don't resolve a workspace context.
 */
export const getActorId = (req: Request): string | null => req.actorId ?? null;

/** Identity provider code for the current session (from the verified JWT). */
export const getActorIdpCode = (req: Request): string | null =>
  req.user?.providerCode?.toLowerCase() ?? null;

/** The caller's identity for audience checks: resolved actor id and provider code (`public` if anon). */
export const resolveCaller = (req: Request): CallerIdentity => ({
  actorId: req.actorId ?? null,
  idpCode: getActorIdpCode(req) ?? req.idpType?.toLowerCase() ?? null,
});

export function resolveActor(req: Request, res: Response, next: NextFunction): void {
  const pluginCode = (req as Request & { idpPluginCode?: string }).idpPluginCode;
  const payload = (req as Request & { authPayload?: Record<string, unknown> }).authPayload;

  if (!pluginCode || !payload || typeof payload !== 'object') {
    return next(new ValidationError('Missing IdP plugin context (idpPluginCode) or token payload'));
  }

  const plugins = getIdpPlugins();
  const plugin = plugins.find((p) => p.code === pluginCode);
  if (!plugin) {
    return next(new ValidationError(`Unknown IdP plugin: ${pluginCode}`));
  }

  const mapped = plugin.claimMapper.mapPayload(payload);
  const actorDisplayLabel =
    mapped.profile?.displayLabel ??
    profileHelpers.getDisplayLabel(mapped.profile, mapped.subject) ??
    null;

  findOrCreateUserByIdentity(
    mapped.providerCode,
    mapped.subject,
    mapped.profile,
    mapped.idpAttributes,
  )
    .then((actorId) => {
      req.actorId = actorId;

      const refresh =
        typeof mapped.sobaAdmin === 'boolean'
          ? upsertSobaAdminFromIdp(actorId, pluginCode, mapped.sobaAdmin, actorDisplayLabel)
          : Promise.resolve();

      return refresh.then(() => isSobaAdmin(actorId));
    })
    .then((admin) => {
      req.isSobaAdmin = admin;
      next();
    })
    .catch(next);
}

/**
 * Actor resolver for routes mounted with `checkJwt({ allowPublic: true })`: resolves the authenticated
 * actor when a token/identity is present, otherwise attributes the request to the seeded public user
 * (idp `public`). The route's own authorization (e.g. the Form submitters audience) decides access;
 * the public user is a member of no workspace, so staff-only routes still reject it.
 */
export function resolveActorOrPublic(req: Request, res: Response, next: NextFunction): void {
  if (req.idpPluginCode && req.authPayload) {
    return resolveActor(req, res, next);
  }

  getPublicUser()
    .then((publicUser) => {
      if (!publicUser) {
        return next(new Error('Public user is not seeded; run the seed step'));
      }
      req.actorId = publicUser.id;
      req.idpType = PUBLIC_PROVIDER_CODE;
      req.isSobaAdmin = false;
      next();
    })
    .catch(next);
}
