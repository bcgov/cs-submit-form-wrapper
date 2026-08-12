import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  OpenSubmissionBodySchema,
  SubmissionDataBodySchema,
  SubmissionIdParamsSchema,
  SubmissionResponseSchema,
} from '../submissions/schema';

extendZodWithOpenApi(z);

export const SubmitFillBundleSchema = z
  .object({
    workflowState: z.string(),
    schema: z.record(z.string(), z.unknown()),
    // The submission's answer document; null for a just-opened submission (no engine document yet).
    content: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('Submit_FillBundle');

const TAG = 'core.submit';
const SUBMISSION_PATH = '/submit/submissions/{id}';
const SUBMISSION_NOT_FOUND = 'Submission not found';
const AUTHZ = 'Not in the form submitters audience';
const AUTH_REQUIRED = 'Authentication required (form is not public)';
const TERMINAL_CONFLICT = 'Submission is already submitted or deleted';
// Optional auth: anonymous is allowed (public audience), or a bearer token for an authenticated
// audience member. `{}` marks the no-auth case explicit rather than leaving security unset.
const PUBLIC_SECURITY = [{}, { bearerAuth: [] }];

export const registerSubmitOpenApi = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'get',
    path: `${SUBMISSION_PATH}/schema`,
    tags: [TAG],
    security: PUBLIC_SECURITY,
    request: { params: SubmissionIdParamsSchema },
    responses: {
      200: {
        description:
          "The submission's own form-version schema, for the read-only confirmation view",
        content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
      },
      403: { description: AUTHZ },
      404: { description: 'Submission or schema not found' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: `${SUBMISSION_PATH}/fill`,
    tags: [TAG],
    security: PUBLIC_SECURITY,
    request: { params: SubmissionIdParamsSchema },
    responses: {
      200: {
        description: 'Workflow state + schema + saved answers for the fill page (resume)',
        content: { 'application/json': { schema: SubmitFillBundleSchema } },
      },
      401: { description: AUTH_REQUIRED },
      403: { description: AUTHZ },
      404: { description: 'Submission or schema not found' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/submit/submissions',
    tags: [TAG],
    security: PUBLIC_SECURITY,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: OpenSubmissionBodySchema } },
      },
    },
    responses: {
      201: {
        description: 'Created submission',
        content: { 'application/json': { schema: SubmissionResponseSchema } },
      },
      401: { description: AUTH_REQUIRED },
      403: { description: AUTHZ },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/submit/submissions/{id}/save',
    tags: [TAG],
    security: PUBLIC_SECURITY,
    request: {
      params: SubmissionIdParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: SubmissionDataBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Saved draft submission',
        content: { 'application/json': { schema: SubmissionResponseSchema } },
      },
      401: { description: AUTH_REQUIRED },
      403: { description: AUTHZ },
      404: { description: SUBMISSION_NOT_FOUND },
      409: { description: TERMINAL_CONFLICT },
    },
  });

  registry.registerPath({
    method: 'post',
    path: `${SUBMISSION_PATH}/submit`,
    tags: [TAG],
    security: PUBLIC_SECURITY,
    request: {
      params: SubmissionIdParamsSchema,
      body: {
        required: true,
        content: { 'application/json': { schema: SubmissionDataBodySchema } },
      },
    },
    responses: {
      200: {
        description: 'Submitted submission',
        content: { 'application/json': { schema: SubmissionResponseSchema } },
      },
      401: { description: AUTH_REQUIRED },
      403: { description: AUTHZ },
      404: { description: SUBMISSION_NOT_FOUND },
      409: { description: TERMINAL_CONFLICT },
    },
  });

  registry.registerPath({
    method: 'get',
    path: SUBMISSION_PATH,
    tags: [TAG],
    security: PUBLIC_SECURITY,
    request: { params: SubmissionIdParamsSchema },
    responses: {
      200: {
        description: 'Submission confirmation (audience-readable)',
        content: { 'application/json': { schema: SubmissionResponseSchema } },
      },
      403: { description: AUTHZ },
      404: { description: SUBMISSION_NOT_FOUND },
    },
  });

  registry.registerPath({
    method: 'get',
    path: `${SUBMISSION_PATH}/data`,
    tags: [TAG],
    security: PUBLIC_SECURITY,
    request: { params: SubmissionIdParamsSchema },
    responses: {
      200: {
        description: 'Submission answer document',
        content: { 'application/json': { schema: z.record(z.string(), z.unknown()) } },
      },
      403: { description: AUTHZ },
      404: { description: 'Submission or its content not found' },
    },
  });
};
