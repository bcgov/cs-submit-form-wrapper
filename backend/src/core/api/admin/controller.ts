import { Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  listSobaAdmins,
  addDirectSobaAdmin,
  removeDirectSobaAdmin,
} from '../../db/repos/sobaAdminRepo';
import {
  getFeatureScopeById,
  listFeatureScopes,
  removeFeatureScope,
  upsertFeatureScope,
} from '../../db/repos/featureScopeRepo';
import { listDocumentGenerationAudits } from '../../db/repos/documentGenerationAuditRepo';
import { getFeatureGateCached } from '../../db/repos/featureRepo';
import { findAppUserById } from '../../db/repos/appUserRepo';
import { db } from '../../db/client';
import { appUsers } from '../../db/schema';
import { FeatureAvailability } from '../../db/codes';
import { NotFoundError, ValidationError } from '../../errors';
import { asyncHandler } from '../shared/asyncHandler';
import {
  AddSobaAdminBodySchema,
  FeatureScopeIdParamsSchema,
  ListFeatureScopesQuerySchema,
  ListDocumentGenerationAuditsQuerySchema,
  ListSobaAdminsQuerySchema,
  UpsertFeatureScopeBodySchema,
} from './schema';
import type { Request } from 'express';

type AddSobaAdminBody = z.infer<typeof AddSobaAdminBodySchema>;
type UpsertFeatureScopeBody = z.infer<typeof UpsertFeatureScopeBodySchema>;
type ListFeatureScopesQuery = z.infer<typeof ListFeatureScopesQuerySchema>;
type ListDocumentGenerationAuditsQuery = z.infer<typeof ListDocumentGenerationAuditsQuerySchema>;
type ListSobaAdminsQuery = z.infer<typeof ListSobaAdminsQuerySchema>;

type FeatureScopeRow = NonNullable<Awaited<ReturnType<typeof getFeatureScopeById>>>;

const toFeatureScopeItem = (row: FeatureScopeRow) => ({
  id: row.id,
  featureCode: row.featureCode,
  scopeType: row.scopeType,
  scopeId: row.scopeId,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  createdBy: row.createdBy,
  updatedBy: row.updatedBy,
});

export const listSobaAdminsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListSobaAdminsQuery;
  const { items, total } = await listSobaAdmins({
    offset: query.offset,
    limit: query.limit,
    sort: query.sort,
    source: query.source,
    q: query.q,
  });
  res.json({
    items: items.map((r) => ({
      userId: r.userId,
      source: r.source,
      identityProviderCode: r.identityProviderCode,
      syncedAt: r.syncedAt != null ? r.syncedAt.toISOString() : null,
      displayLabel: r.displayLabel,
    })),
    page: {
      offset: query.offset,
      limit: query.limit,
      total,
    },
    filters: {
      source: query.source,
      q: query.q,
    },
    sort: query.sort,
  });
});

export const addSobaAdminHandler = asyncHandler(
  async (req: Request<unknown, unknown, AddSobaAdminBody>, res: Response) => {
    const body = req.body as AddSobaAdminBody;
    // user_id is a foreign key, so an unknown id would surface as a 500.
    if (!(await findAppUserById(body.userId))) {
      throw new ValidationError(`Unknown user: ${body.userId}`);
    }

    let actorDisplayLabel: string | null = null;
    if (req.actorId) {
      const row = await db
        .select({ displayLabel: appUsers.displayLabel })
        .from(appUsers)
        .where(eq(appUsers.id, req.actorId))
        .limit(1);
      actorDisplayLabel = row[0]?.displayLabel ?? null;
    }
    await addDirectSobaAdmin(body.userId, actorDisplayLabel);
    res.status(204).send();
  },
);

export const removeSobaAdminHandler = asyncHandler(
  async (req: Request<{ userId: string }>, res: Response) => {
    const { userId } = req.params;
    // Only direct grants are removable, so this is also the answer for an IdP-sourced admin.
    const removed = await removeDirectSobaAdmin(userId);
    if (!removed) throw new NotFoundError('Direct SOBA admin not found');
    res.status(204).send();
  },
);

export const upsertFeatureScopeHandler = asyncHandler(
  async (req: Request<unknown, unknown, UpsertFeatureScopeBody>, res: Response) => {
    const body = req.body as UpsertFeatureScopeBody;
    // feature_code is a foreign key, so an unknown code would surface as a 500. A grant on a
    // non-scoped feature is inert (isFeatureAvailable short-circuits before reading grants), so
    // storing one would only mislead.
    const gate = await getFeatureGateCached(body.featureCode, Date.now());
    if (!gate) {
      throw new ValidationError(`Unknown feature code: ${body.featureCode}`);
    }
    if (gate.availability !== FeatureAvailability.scoped) {
      throw new ValidationError(`Feature is not scoped: ${body.featureCode}`);
    }
    await upsertFeatureScope({
      featureCode: body.featureCode,
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      status: body.status,
      updatedBy: req.actorId ?? null,
    });
    res.status(204).send();
  },
);

export const listFeatureScopesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListFeatureScopesQuery;
  const { items, total } = await listFeatureScopes(query);
  res.json({
    items: items.map(toFeatureScopeItem),
    page: { offset: query.offset, limit: query.limit, total },
    filters: {
      featureCode: query.featureCode,
      scopeType: query.scopeType,
      status: query.status,
    },
    sort: query.sort,
  });
});

export const getFeatureScopeHandler = asyncHandler(
  async (req: Request<z.infer<typeof FeatureScopeIdParamsSchema>>, res: Response) => {
    const row = await getFeatureScopeById(req.params.featureScopeId);
    if (!row) throw new NotFoundError('Feature scope not found');
    res.json(toFeatureScopeItem(row));
  },
);

export const removeFeatureScopeHandler = asyncHandler(
  async (req: Request<z.infer<typeof FeatureScopeIdParamsSchema>>, res: Response) => {
    const deleted = await removeFeatureScope(req.params.featureScopeId);
    if (!deleted) throw new NotFoundError('Feature scope not found');
    res.status(204).send();
  },
);

export const listDocumentGenerationAuditsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.query as unknown as ListDocumentGenerationAuditsQuery;
    const { items, total } = await listDocumentGenerationAudits({
      workspaceId: query.workspaceId,
      formId: query.formId,
      offset: query.offset,
      limit: query.limit,
      sort: query.sort,
    });
    res.json({
      items: items.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      page: { offset: query.offset, limit: query.limit, total },
      filters: { workspaceId: query.workspaceId, formId: query.formId },
      sort: query.sort,
    });
  },
);
