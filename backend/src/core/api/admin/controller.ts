import { Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  listSobaAdmins,
  addDirectSobaAdmin,
  removeDirectSobaAdmin,
} from '../../db/repos/sobaAdminRepo';
import { upsertFeatureScope } from '../../db/repos/featureScopeRepo';
import { listDocumentGenerationAudits } from '../../db/repos/documentGenerationAuditRepo';
import { db } from '../../db/client';
import { appUsers } from '../../db/schema';
import { asyncHandler } from '../shared/asyncHandler';
import { decodeCursor, encodeCursor } from '../shared/pagination';
import {
  AddSobaAdminBodySchema,
  ListDocumentGenerationAuditsQuerySchema,
  UpsertFeatureScopeBodySchema,
} from './schema';
import type { Request } from 'express';

type AddSobaAdminBody = z.infer<typeof AddSobaAdminBodySchema>;
type UpsertFeatureScopeBody = z.infer<typeof UpsertFeatureScopeBodySchema>;
type ListDocumentGenerationAuditsQuery = z.infer<typeof ListDocumentGenerationAuditsQuerySchema>;

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
