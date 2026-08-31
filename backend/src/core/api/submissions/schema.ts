import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  makeSortEnum,
  offsetQueryFields,
  rejectedCursorField,
  searchQueryField,
  OffsetPageSchema,
  OFFSET_DRIFT_NOTE,
} from '../shared/offsetPagination';
import { SUBMISSION_SORT_FIELDS } from '../../db/repos/submissionRepo';
import {
  workspaceIdQueryField,
  formIdQueryField,
  formVersionIdQueryField,
  submissionIdQueryField,
  requireAtLeastOneQueryField,
} from '../shared/schema';

extendZodWithOpenApi(z);

// The client mints the submission id (uuidv7) so it can originate a submission without a round-trip.
// Create is idempotent on this id (see openSubmission), which is what makes a retry safe. Enforce v7
// specifically: the id is the record's identity, so we reject nil/low-entropy or wrong-version uuids.
export const OpenSubmissionBodySchema = z
  .object({
    id: z.uuidv7(),
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

export const SubmissionSortSchema = makeSortEnum(SUBMISSION_SORT_FIELDS).openapi(
  'Submissions_SubmissionSort',
);

export const ListSubmissionsQuerySchema = requireAtLeastOneQueryField(
  z.object({
    workspaceId: workspaceIdQueryField.optional(),
    formId: formIdQueryField,
    formVersionId: formVersionIdQueryField,
    submissionId: submissionIdQueryField,
    ...offsetQueryFields,
    cursor: rejectedCursorField,
    // Workflow state orders by code, not by where the workflow has reached, so it is a filter only.
    workflowState: z.string().trim().min(1).optional(),
    createdBy: z.string().trim().min(1).optional(),
    q: searchQueryField.openapi({
      description: 'Matches anywhere in the form name or the submission id.',
    }),
    sort: SubmissionSortSchema.default('updatedAt:desc'),
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
    page: OffsetPageSchema,
    filters: z.object({
      workspaceId: z.string().optional(),
      formId: z.string().optional(),
      formVersionId: z.string().optional(),
      submissionId: z.string().optional(),
      workflowState: z.string().optional(),
      createdBy: z.string().optional(),
      q: z.string().optional(),
    }),
    sort: SubmissionSortSchema,
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
        description: `List submissions with search and offset pagination. ${OFFSET_DRIFT_NOTE}`,
        content: {
          'application/json': {
            schema: ListSubmissionsResponseSchema,
          },
        },
      },
      400: {
        description: 'Missing scope anchor, inconsistent hierarchy ids, or invalid query',
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
