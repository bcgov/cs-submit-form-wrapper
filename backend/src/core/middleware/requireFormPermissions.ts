import type { NextFunction, Request, Response } from 'express';
import { ForbiddenError } from '../errors';
import {
  hasAllPermissions,
  resolveFormPermissions,
  getWorkspaceIdsWithAllPermissions,
} from '../db/repos/formAccessRepo';
import type { PermissionCode } from '../db/codes';

/**
 * Gates a route on form permissions. Runs after workspace resolution (needs `req.coreContext`);
 * responds 403 when the caller lacks any of the required permissions. Resolution is workspace-scoped
 * (a caller's form permissions are the same for every form in the workspace).
 */
export const requireFormPermissions = (required: readonly PermissionCode[]) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const context = req.coreContext;
      if (!context) {
        if (req.listScope && !req.listScope.selectedWorkspaceId) {
          req.listScope.workspaceIds = await getWorkspaceIdsWithAllPermissions(
            req.listScope.actorId,
            required,
          );
          return next();
        }
        throw new Error('requireFormPermissions must run after workspace resolution');
      }
      const permissions = await resolveFormPermissions(context.actorId, context.workspaceId);
      if (!hasAllPermissions(permissions, required)) {
        throw new ForbiddenError('Insufficient form permissions');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
};
