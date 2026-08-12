import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { CursorSortSchema } from '../shared/pagination';
import {
  workspaceIdQueryField,
  formIdQueryField,
  formVersionIdQueryField,
  submissionIdQueryField,
  requireAtLeastOneQueryField,
} from '../shared/schema';

extendZodWithOpenApi(z);

export const OpenSubmissionBodySchema = z
  .object({
    formId: z.string().min(1),
  })
  .openapi('Submissions_OpenSubmissionBody');

// The submission id path param, shared by every /:id route (read/save/submit/delete).
export const SubmissionIdParamsSchema = z
  .object({
    id: z.string().min(1),
  })
  .openapi('Submissions_SubmissionIdParams');

// The answer-data body, shared by save (draft) and submit.
export const SubmissionDataBodySchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
  })
  .openapi('Submissions_SubmissionDataBody');

export const ListSubmissionsQuerySchema = requireAtLeastOneQueryField(
  z.object({
    workspaceId: workspaceIdQueryField.optional(),
    formId: formIdQueryField,
    formVersionId: formVersionIdQueryField,
    submissionId: submissionIdQueryField,
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
    workflowState: z.string().trim().min(1).optional(),
    createdBy: z.string().trim().min(1).optional(),
    sort: CursorSortSchema.default('id:desc'),
  }),
  ['workspaceId', 'formId', 'formVersionId', 'submissionId'],
  'At least one of workspaceId, formId, formVersionId, or submissionId is required',
).openapi('Submissions_ListSubmissionsQuery');

export const SubmissionListItemSchema = z
  .object({
    id: z.string(),
    formId: z.string(),
    formName: z.string().optional(),
    formVersionId: z.string(),
    versionNo: z.number().int().optional(),
    workflowState: z.string(),
    engineSyncStatus: z.string(),
    submittedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Submissions_SubmissionListItem');

export const SubmissionResponseSchema = z
  .object({
    id: z.string(),
    formId: z.string(),
    formVersionId: z.string(),
    workflowState: z.string(),
    engineSyncStatus: z.string(),
    currentRevisionNo: z.number().int(),
    submittedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Submissions_SubmissionResponse');

export const ListSubmissionsResponseSchema = z
  .object({
    items: z.array(SubmissionListItemSchema),
    page: z.object({
      limit: z.number().int().min(1),
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
      cursorMode: z.enum(['id', 'ts_id']),
    }),
    filters: z.object({
      workspaceId: z.string().optional(),
      formId: z.string().optional(),
      formVersionId: z.string().optional(),
      submissionId: z.string().optional(),
      workflowState: z.string().optional(),
      createdBy: z.string().optional(),
    }),
    sort: CursorSortSchema,
  })
  .openapi('Submissions_ListSubmissionsResponse');

const TAG = 'core.submissions';
const SUBMISSION_PATH = '/design/submissions/{id}';
const SUBMISSION_NOT_FOUND = 'Submission not found';

export const registerSubmissionsOpenApi = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'get',
    path: '/design/submissions',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      query: ListSubmissionsQuerySchema,
    },
    responses: {
      200: {
        description: 'List submissions with cursor pagination',
        content: {
          'application/json': {
            schema: ListSubmissionsResponseSchema,
          },
        },
      },
      400: {
        description: 'Missing scope anchor, inconsistent hierarchy ids, invalid query, or cursor',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: SUBMISSION_PATH,
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      params: SubmissionIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Get submission by id',
        content: { 'application/json': { schema: SubmissionResponseSchema } },
      },
      404: {
        description: SUBMISSION_NOT_FOUND,
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/design/submissions/{id}/data',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      params: SubmissionIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Submission answer document (engine document, engine-managed fields stripped)',
        content: {
          'application/json': { schema: z.record(z.string(), z.unknown()) },
        },
      },
      404: {
        description: 'Submission or its engine content not found',
      },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: SUBMISSION_PATH,
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      params: SubmissionIdParamsSchema,
    },
    responses: {
      204: {
        description: 'Submission marked as deleted',
      },
      404: {
        description: SUBMISSION_NOT_FOUND,
      },
    },
  });
};
