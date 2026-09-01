import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const SobaAdminItemSchema = z
  .object({
    userId: z.string(),
    source: z.string(),
    identityProviderCode: z.string().nullable(),
    syncedAt: z.string().nullable(),
    displayLabel: z.string().nullable(),
  })
  .openapi('Admin_SobaAdminItem');

export const ListSobaAdminsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  })
  .openapi('Admin_ListSobaAdminsQuery');

export const ListDocumentGenerationAuditsQuerySchema = z
  .object({
    workspaceId: z.uuid().optional(),
    formId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .refine((value) => !!value.workspaceId || !!value.formId, {
    message: 'At least one of workspaceId or formId is required',
    path: ['workspaceId'],
  })
  .openapi('Admin_ListDocumentGenerationAuditsQuery');

export const ListSobaAdminsResponseSchema = z
  .object({
    items: z.array(SobaAdminItemSchema),
    page: z.object({
      limit: z.number().int().min(1),
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
      cursorMode: z.enum(['id']),
    }),
  })
  .openapi('Admin_ListSobaAdminsResponse');

export const DocumentGenerationAuditItemSchema = z
  .object({
    id: z.uuid(),
    workspaceId: z.uuid(),
    formId: z.uuid(),
    submissionId: z.uuid(),
    mode: z.string(),
    backendCode: z.string(),
    outcome: z.string(),
    httpStatus: z.number().int().nullable(),
    durationMs: z.number().int(),
    errorDetail: z.string().nullable(),
    requestId: z.string().nullable(),
    createdBy: z.uuid(),
    createdAt: z.string(),
  })
  .openapi('Admin_DocumentGenerationAuditItem');

/** Truncation only: these lists are capped, not cursor-paged, so there is no cursor to hand back. */
const AdminPageSchema = z.object({
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
});

export const ListDocumentGenerationAuditsResponseSchema = z
  .object({
    items: z.array(DocumentGenerationAuditItemSchema),
    page: AdminPageSchema,
  })
  .openapi('Admin_ListDocumentGenerationAuditsResponse');

export const FeatureScopeItemSchema = z
  .object({
    id: z.uuid(),
    featureCode: z.string(),
    scopeType: z.enum(['workspace', 'form']),
    scopeId: z.uuid(),
    status: z.enum(['active', 'inactive']),
    createdAt: z.string(),
    updatedAt: z.string(),
    createdBy: z.string().nullable(),
    updatedBy: z.string().nullable(),
  })
  .openapi('Admin_FeatureScopeItem');

export const ListFeatureScopesQuerySchema = z
  .object({
    featureCode: z.string().min(1).optional(),
    scopeType: z.enum(['workspace', 'form']).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .openapi('Admin_ListFeatureScopesQuery');

export const ListFeatureScopesResponseSchema = z
  .object({
    items: z.array(FeatureScopeItemSchema),
    page: AdminPageSchema,
  })
  .openapi('Admin_ListFeatureScopesResponse');

export const AddSobaAdminBodySchema = z
  .object({
    userId: z.string().uuid(),
  })
  .openapi('Admin_AddSobaAdminBody');

export const UpsertFeatureScopeBodySchema = z
  .object({
    featureCode: z.string().min(1),
    scopeType: z.enum(['workspace', 'form']),
    scopeId: z.uuid(),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .openapi('Admin_UpsertFeatureScopeBody');

export const SobaAdminUserIdParamsSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .openapi('Admin_SobaAdminUserIdParams');

export const FeatureScopeIdParamsSchema = z
  .object({
    featureScopeId: z.uuid(),
  })
  .openapi('Admin_FeatureScopeIdParams');

const TAG = 'core.admin';
const REQUIRES_SOBA_ADMIN = 'Requires soba_admin role';

export const registerAdminOpenApi = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'get',
    path: '/admin/soba-admins',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      query: ListSobaAdminsQuerySchema,
    },
    responses: {
      200: {
        description: 'List SOBA platform admins with cursor pagination',
        content: {
          'application/json': {
            schema: ListSobaAdminsResponseSchema,
          },
        },
      },
      400: { description: 'Invalid query or cursor' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/soba-admins',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: AddSobaAdminBodySchema,
          },
        },
      },
    },
    responses: {
      204: { description: 'Direct SOBA admin grant added or converted' },
      400: { description: 'Invalid body: userId not a UUID, or no such user' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/admin/soba-admins/{userId}',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    responses: {
      204: { description: 'Direct grant removed' },
      400: { description: 'Invalid userId' },
      404: { description: 'No direct grant for that user' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/feature-scopes',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      query: ListFeatureScopesQuerySchema,
    },
    responses: {
      200: {
        description: 'List feature scope grants',
        content: {
          'application/json': {
            schema: ListFeatureScopesResponseSchema,
          },
        },
      },
      400: { description: 'Invalid query' },
      403: { description: REQUIRES_SOBA_ADMIN },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/feature-scopes/{featureScopeId}',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      params: FeatureScopeIdParamsSchema,
    },
    responses: {
      200: {
        description: 'Read a feature scope grant',
        content: {
          'application/json': {
            schema: FeatureScopeItemSchema,
          },
        },
      },
      400: { description: 'Invalid featureScopeId' },
      403: { description: REQUIRES_SOBA_ADMIN },
      404: { description: 'Feature scope not found' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/admin/feature-scopes/{featureScopeId}',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      params: FeatureScopeIdParamsSchema,
    },
    responses: {
      204: { description: 'Feature scope grant deleted' },
      400: { description: 'Invalid featureScopeId' },
      403: { description: REQUIRES_SOBA_ADMIN },
      404: { description: 'Feature scope not found' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: '/admin/feature-scopes',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: UpsertFeatureScopeBodySchema,
          },
        },
      },
    },
    responses: {
      204: {
        description:
          'Feature scope upserted. Creates when missing, otherwise updates existing row status.',
      },
      400: { description: 'Invalid request body, unknown feature code, or feature is not scoped' },
      403: { description: REQUIRES_SOBA_ADMIN },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/admin/document-generation/audits',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      query: ListDocumentGenerationAuditsQuerySchema,
    },
    responses: {
      200: {
        description: 'Recent document generation audit rows for workspace/form scope',
        content: {
          'application/json': {
            schema: ListDocumentGenerationAuditsResponseSchema,
          },
        },
      },
      400: { description: 'Invalid query (workspaceId/formId/limit)' },
      403: { description: REQUIRES_SOBA_ADMIN },
      404: { description: 'Document generation feature is disabled' },
    },
  });
};
