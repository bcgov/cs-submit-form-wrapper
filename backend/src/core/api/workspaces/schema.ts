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
import { WORKSPACE_SORT_FIELDS } from '../../db/repos/membershipRepo';
import { WORKSPACE_NAME_TAKEN } from '../../messages';
import { WorkspaceScopedQuerySchema } from '../shared/schema';

extendZodWithOpenApi(z);

export const WorkspaceItemSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.string(),
    role: z.string(),
    status: z.string(),
    org: z.string().nullable(),
    useCase: z.string().nullable(),
    disclaimerAccepted: z.boolean(),
  })
  .openapi('Workspaces_WorkspaceItem');

export const WorkspaceSortSchema = makeSortEnum(WORKSPACE_SORT_FIELDS).openapi(
  'Workspaces_WorkspaceSort',
);

export const ListWorkspacesQuerySchema = z
  .object({
    ...offsetQueryFields,
    cursor: rejectedCursorField,
    kind: z.string().trim().min(1).optional(),
    status: z.string().trim().min(1).optional(),
    q: searchQueryField.openapi({
      description: 'Matches anywhere in the workspace name or organization.',
    }),
    requiredPermission: z.string().trim().min(1).optional(),
    sort: WorkspaceSortSchema.default('name:asc'),
  })
  .openapi('Workspaces_ListWorkspacesQuery');

export const ListWorkspacesResponseSchema = z
  .object({
    items: z.array(WorkspaceItemSchema),
    page: OffsetPageSchema,
    filters: z.object({
      kind: z.string().optional(),
      status: z.string().optional(),
      q: z.string().optional(),
      requiredPermission: z.string().optional(),
    }),
    sort: WorkspaceSortSchema,
  })
  .openapi('Workspaces_ListWorkspacesResponse');

export const CurrentWorkspaceResponseSchema = WorkspaceItemSchema.openapi(
  'Workspaces_CurrentWorkspaceResponse',
);

export const WorkspaceIdParamsSchema = z
  .object({
    id: z.string().min(1),
  })
  .openapi('Workspaces_WorkspaceIdParams');

export const CreateWorkspaceBodySchema = z
  .object({
    name: z.string().trim().min(1),
    org: z.string().trim().min(1),
    useCase: z.string().trim().min(1),
    disclaimerAccepted: z.boolean().optional(),
  })
  .openapi('Workspaces_CreateWorkspaceBody');

export const UpdateWorkspaceBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    org: z.string().trim().min(1).optional(),
    useCase: z.string().trim().min(1).optional(),
    disclaimerAccepted: z.boolean().optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.org !== undefined ||
      body.useCase !== undefined ||
      body.disclaimerAccepted !== undefined,
    {
      message: 'Provide a field to update',
    },
  )
  .openapi('Workspaces_UpdateWorkspaceBody');

const TAG = 'core.workspaces';
const WORKSPACES_PATH = '/workspaces';
const WORKSPACE_PATH = `${WORKSPACES_PATH}/{id}`;

export const registerWorkspacesOpenApi = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'get',
    path: WORKSPACES_PATH,
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      query: ListWorkspacesQuerySchema,
    },
    responses: {
      200: {
        description: `List workspaces for the current user with search and offset pagination. ${OFFSET_DRIFT_NOTE}`,
        content: {
          'application/json': {
            schema: ListWorkspacesResponseSchema,
          },
        },
      },
      400: { description: 'Invalid query' },
    },
  });

  registry.registerPath({
    method: 'get',
    path: `${WORKSPACES_PATH}/current`,
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      query: WorkspaceScopedQuerySchema,
    },
    responses: {
      200: {
        description: 'Current workspace resolved from the workspaceId query parameter',
        content: {
          'application/json': {
            schema: CurrentWorkspaceResponseSchema,
          },
        },
      },
      404: {
        description: 'Current workspace not found',
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: WORKSPACE_PATH,
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      params: WorkspaceIdParamsSchema,
    },
    responses: {
      200: {
        description:
          'Select a workspace by id (verifies membership; echoes x-soba-workspace-id response header)',
        content: {
          'application/json': {
            schema: CurrentWorkspaceResponseSchema,
          },
        },
      },
      403: { description: 'Actor is not a member of the workspace' },
      404: { description: 'Workspace not found' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: WORKSPACES_PATH,
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: CreateWorkspaceBodySchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Workspace created',
        content: {
          'application/json': {
            schema: WorkspaceItemSchema,
          },
        },
      },
      400: { description: 'Invalid body' },
      409: { description: WORKSPACE_NAME_TAKEN },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: WORKSPACE_PATH,
    tags: [TAG],
    security: [{ bearerAuth: [] }],
    request: {
      params: WorkspaceIdParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: UpdateWorkspaceBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Workspace updated',
        content: {
          'application/json': {
            schema: WorkspaceItemSchema,
          },
        },
      },
      403: { description: 'Only workspace owners can rename this workspace' },
      404: { description: 'Workspace not found' },
      409: { description: WORKSPACE_NAME_TAKEN },
    },
  });
};
