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
import { SOBA_ADMIN_SORT_FIELDS } from '../../db/repos/sobaAdminRepo';

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

export const SobaAdminSortSchema =
  makeSortEnum(SOBA_ADMIN_SORT_FIELDS).openapi('Admin_SobaAdminSort');

export const ListSobaAdminsQuerySchema = z
  .object({
    ...offsetQueryFields,
    cursor: rejectedCursorField,
    source: z.string().trim().min(1).optional(),
    q: searchQueryField.openapi({ description: 'Matches anywhere in the admin display label.' }),
    sort: SobaAdminSortSchema.default('displayLabel:asc'),
  })
  .openapi('Admin_ListSobaAdminsQuery');

export const ListSobaAdminsResponseSchema = z
  .object({
    items: z.array(SobaAdminItemSchema),
    page: OffsetPageSchema,
    filters: z.object({
      source: z.string().optional(),
      q: z.string().optional(),
    }),
    sort: SobaAdminSortSchema,
  })
  .openapi('Admin_ListSobaAdminsResponse');

export const AddSobaAdminBodySchema = z
  .object({
    userId: z.string().uuid(),
  })
  .openapi('Admin_AddSobaAdminBody');

export const SobaAdminUserIdParamsSchema = z
  .object({
    userId: z.string().uuid(),
  })
  .openapi('Admin_SobaAdminUserIdParams');

const TAG = 'core.admin';

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
        description: `List SOBA platform admins with search and offset pagination. ${OFFSET_DRIFT_NOTE}`,
        content: {
          'application/json': {
            schema: ListSobaAdminsResponseSchema,
          },
        },
      },
      400: { description: 'Invalid query' },
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
      400: { description: 'Invalid body (e.g. userId not a UUID)' },
    },
  });

  registry.registerPath({
    method: 'delete',
    path: '/admin/soba-admins/{userId}',
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    responses: {
      204: { description: 'Direct grant removed (or no-op if not direct)' },
      400: { description: 'Invalid userId' },
    },
  });
};
