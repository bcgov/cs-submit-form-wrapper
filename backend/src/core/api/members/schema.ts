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
import { MEMBER_SORT_FIELDS } from '../../db/repos/membershipRepo';
import { workspaceIdQueryField } from '../shared/schema';

extendZodWithOpenApi(z);

export const MemberItemSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    displayLabel: z.string().nullable(),
    role: z.string(),
    status: z.string(),
  })
  .openapi('Members_MemberItem');

export const MemberSortSchema = makeSortEnum(MEMBER_SORT_FIELDS).openapi('Members_MemberSort');

export const ListMembersQuerySchema = z
  .object({
    workspaceId: workspaceIdQueryField,
    ...offsetQueryFields,
    cursor: rejectedCursorField,
    role: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    q: searchQueryField.openapi({ description: 'Matches anywhere in the member display label.' }),
    sort: MemberSortSchema.default('displayLabel:asc'),
  })
  .openapi('Members_ListMembersQuery');

export const ListMembersResponseSchema = z
  .object({
    items: z.array(MemberItemSchema),
    page: OffsetPageSchema,
    filters: z.object({
      workspaceId: z.string().optional(),
      role: z.string().optional(),
      status: z.string().optional(),
      q: z.string().optional(),
    }),
    sort: MemberSortSchema,
  })
  .openapi('Members_ListMembersResponse');

export const registerMembersOpenApi = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'get',
    path: '/members',
    tags: ['core.members'],
    security: [{ bearerAuth: [] }],
    request: {
      query: ListMembersQuerySchema,
    },
    responses: {
      200: {
        description: `List members of the current workspace with search and offset pagination. ${OFFSET_DRIFT_NOTE}`,
        content: {
          'application/json': {
            schema: ListMembersResponseSchema,
          },
        },
      },
      400: { description: 'Invalid query' },
    },
  });
};
