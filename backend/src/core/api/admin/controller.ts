import { Response } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  listSobaAdmins,
  addDirectSobaAdmin,
  removeDirectSobaAdmin,
} from '../../db/repos/sobaAdminRepo';
import { db } from '../../db/client';
import { appUsers } from '../../db/schema';
import { asyncHandler } from '../shared/asyncHandler';
import { AddSobaAdminBodySchema, ListSobaAdminsQuerySchema } from './schema';
import type { Request } from 'express';

type AddSobaAdminBody = z.infer<typeof AddSobaAdminBodySchema>;
type ListSobaAdminsQuery = z.infer<typeof ListSobaAdminsQuerySchema>;

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
