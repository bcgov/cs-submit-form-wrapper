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
import { db } from '../../db/client';
import { appUsers } from '../../db/schema';
import { NotFoundError } from '../../errors';
import { asyncHandler } from '../shared/asyncHandler';
import { decodeCursor, encodeCursor } from '../shared/pagination';
import {
  AddSobaAdminBodySchema,
  FeatureScopeIdParamsSchema,
  ListFeatureScopesQuerySchema,
  ListDocumentGenerationAuditsQuerySchema,
  UpsertFeatureScopeBodySchema,
} from './schema';
import type { Request } from 'express';

type AddSobaAdminBody = z.infer<typeof AddSobaAdminBodySchema>;
type UpsertFeatureScopeBody = z.infer<typeof UpsertFeatureScopeBodySchema>;
type ListFeatureScopesQuery = z.infer<typeof ListFeatureScopesQuerySchema>;
type ListDocumentGenerationAuditsQuery = z.infer<typeof ListDocumentGenerationAuditsQuerySchema>;

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
  const limit = Number(req.query.limit) || 20;
  const cursorRaw = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
  let afterUserId: string | undefined;
  if (cursorRaw) {
    try {
      const decoded = decodeCursor(cursorRaw);
      if (decoded.m === 'id') afterUserId = decoded.id;
    } catch {
      // invalid cursor; first page
    }
  }
  const { items, hasMore } = await listSobaAdmins({ limit, afterUserId });
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? encodeCursor({ m: 'id', id: lastItem.userId }) : null;
  res.json({
    items: items.map((r) => ({
      userId: r.userId,
      source: r.source,
      identityProviderCode: r.identityProviderCode,
      syncedAt: r.syncedAt != null ? r.syncedAt.toISOString() : null,
      displayLabel: r.displayLabel,
    })),
    page: {
      limit,
      hasMore,
      nextCursor,
      cursorMode: 'id' as const,
    },
  });
});

export const addSobaAdminHandler = asyncHandler(
  async (req: Request<unknown, unknown, AddSobaAdminBody>, res: Response) => {
    const body = req.body as AddSobaAdminBody;
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
    await removeDirectSobaAdmin(userId);
    res.status(204).send();
  },
);

export const upsertFeatureScopeHandler = asyncHandler(
  async (req: Request<unknown, unknown, UpsertFeatureScopeBody>, res: Response) => {
    const body = req.body as UpsertFeatureScopeBody;
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
  const rows = await listFeatureScopes(query);
  res.json({ items: rows.map(toFeatureScopeItem) });
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
    await removeFeatureScope(req.params.featureScopeId);
    res.status(204).send();
  },
);

export const listDocumentGenerationAuditsHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = req.query as unknown as ListDocumentGenerationAuditsQuery;
    const rows = await listDocumentGenerationAudits({
      workspaceId: query.workspaceId,
      formId: query.formId,
      limit: query.limit,
    });
    res.json({
      items: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  },
);
