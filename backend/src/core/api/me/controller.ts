import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../shared/asyncHandler';
import type { Request } from 'express';
import { NotFoundError, ValidationError } from '../../errors';
import { getActorId, getActorIdpCode } from '../../middleware/actor';
import { meApiService } from './service';
import { PatchMeBodySchema } from './schema';

type PatchMeBody = z.infer<typeof PatchMeBodySchema>;

export const getCurrentActor = asyncHandler(async (req: Request, res: Response) => {
  const actorId = getActorId(req);
  if (!actorId) {
    throw new ValidationError('Missing actor identity (actorId or x-soba-user-id)');
  }
  const result = await meApiService.get(actorId, getActorIdpCode(req), req.isSobaAdmin === true);
  if (!result) {
    throw new NotFoundError('Current actor not found');
  }
  res.json(result);
});

export const patchCurrentActor = asyncHandler(async (req: Request, res: Response) => {
  const actorId = getActorId(req);
  if (!actorId) {
    throw new ValidationError('Missing actor identity (actorId or x-soba-user-id)');
  }
  const result = await meApiService.patch(
    actorId,
    getActorIdpCode(req),
    req.body as PatchMeBody,
    req.isSobaAdmin === true,
  );
  if (!result) {
    throw new NotFoundError('Current actor not found');
  }
  res.json(result);
});
