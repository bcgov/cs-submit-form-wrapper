import { Response } from 'express';
import { z } from 'zod';
import {
  ListSubmissionsQuerySchema,
  OpenSubmissionBodySchema,
  SubmissionDataBodySchema,
  SubmissionIdParamsSchema,
} from './schema';
import { submissionsApiService } from './service';
import { asyncHandler } from '../shared/asyncHandler';
import { NotFoundError } from '../../errors';
import { filesService } from '../../../features/files/service';
import { log } from '../../logging';
import type { Request } from 'express';

type OpenSubmissionBody = z.infer<typeof OpenSubmissionBodySchema>;
type SubmissionIdParams = z.infer<typeof SubmissionIdParamsSchema>;
type SubmissionDataBody = z.infer<typeof SubmissionDataBodySchema>;
type ListSubmissionsQuery = z.infer<typeof ListSubmissionsQuerySchema>;

const SUBMISSION_NOT_FOUND = 'Submission not found';

export const getSubmission = asyncHandler(
  async (req: Request<SubmissionIdParams>, res: Response) => {
    const ctx = req.coreContext!;
    const result = await submissionsApiService.get(ctx, req.params.id);
    if (!result) {
      throw new NotFoundError(SUBMISSION_NOT_FOUND);
    }
    res.json(result);
  },
);

export const getSubmissionData = asyncHandler(
  async (req: Request<SubmissionIdParams>, res: Response) => {
    const ctx = req.coreContext!;
    const result = await submissionsApiService.getData(ctx, req.params.id);
    if (!result) {
      throw new NotFoundError('Submission content not found');
    }
    res.json(result);
  },
);

export const listSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const scope = req.listScope!;
  const result = await submissionsApiService.list(
    { workspaceIds: scope.workspaceIds, actorId: scope.actorId },
    req.query as unknown as ListSubmissionsQuery,
  );
  res.json(result);
});

export const openSubmission = asyncHandler(
  async (req: Request<unknown, unknown, OpenSubmissionBody>, res: Response) => {
    const ctx = req.coreContext!;
    const result = await submissionsApiService.open(ctx, req.body.formId);
    res.status(201).json(result);
  },
);

/**
 * Tag the submission's uploaded files with its id. Best-effort — must not fail the save/submit.
 * Couples submissions to the files feature; a 'submission.saved' event over a message bus would
 * decouple it once one exists.
 */
const associateSubmissionFiles = async (
  submissionId: string,
  workspaceId: string,
  data: Record<string, unknown>,
): Promise<void> => {
  try {
    await filesService.associateWithSubmission(submissionId, workspaceId, data);
  } catch (err) {
    log.warn({ err, submissionId }, 'Failed to associate uploaded files with submission');
  }
};

export const saveSubmission = asyncHandler(
  async (req: Request<SubmissionIdParams, unknown, SubmissionDataBody>, res: Response) => {
    const ctx = req.coreContext!;
    const result = await submissionsApiService.save(ctx, req.params.id, req.body.data);
    await associateSubmissionFiles(req.params.id, ctx.workspaceId, req.body.data);
    res.json(result);
  },
);

export const submitSubmission = asyncHandler(
  async (req: Request<SubmissionIdParams, unknown, SubmissionDataBody>, res: Response) => {
    const ctx = req.coreContext!;
    const result = await submissionsApiService.submit(ctx, req.params.id, req.body.data);
    await associateSubmissionFiles(req.params.id, ctx.workspaceId, req.body.data);
    res.json(result);
  },
);

export const deleteSubmission = asyncHandler(
  async (req: Request<SubmissionIdParams>, res: Response) => {
    const ctx = req.coreContext!;
    const result = await submissionsApiService.delete(ctx, req.params.id);
    if (!result) {
      throw new NotFoundError(SUBMISSION_NOT_FOUND);
    }
    res.status(204).send();
  },
);
