import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const PluginCatalogEntrySchema = z
  .object({
    code: z.string(),
    enabled: z.boolean(),
    hasApi: z.boolean(),
    apiBasePath: z.string().optional(),
  })
  .openapi('Meta_PluginCatalogEntry');

export const PluginsMetaResponseSchema = z
  .object({
    plugins: z.array(PluginCatalogEntrySchema),
  })
  .openapi('Meta_PluginsResponse');

export const FeatureMetaSchema = z
  .object({
    code: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    version: z.string().nullable(),
    status: z.string(),
    /** How the feature is gated: 'fixed' (everywhere platform-enabled) or 'scoped' (per workspace/form grant). */
    availability: z.string(),
    platformAllowed: z.boolean(),
  })
  .openapi('Meta_Feature');

export const FeaturesMetaResponseSchema = z
  .object({
    features: z.array(FeatureMetaSchema),
  })
  .openapi('Meta_FeaturesResponse');

export const FeatureAvailabilityQuerySchema = z
  .object({
    code: z.string().min(1),
    // Validate as uuid so a malformed id is a clean 400, not a uuid-cast 500 in the grant lookup.
    workspaceId: z.string().uuid().optional(),
    formId: z.string().uuid().optional(),
  })
  .openapi('Meta_FeatureAvailabilityQuery');

export const FeatureAvailabilityResponseSchema = z
  .object({
    code: z.string(),
    available: z.boolean(),
  })
  .openapi('Meta_FeatureAvailabilityResponse');

export const BuildMetaResponseSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    nodeVersion: z.string(),
    gitSha: z.string(),
    gitTag: z.string(),
    imageTag: z.string(),
  })
  .openapi('Meta_BuildResponse');

export const FrontendConfigMetaResponseSchema = z
  .object({
    auth: z.object({
      provider: z.literal('keycloak'),
      idpPluginDefaultCode: z.string(),
      keycloak: z.object({
        url: z.string(),
        realm: z.string(),
        clientId: z.string(),
        pkceMethod: z.literal('S256'),
      }),
    }),
    api: z.object({
      baseUrl: z.string(),
    }),
    app: z
      .object({
        submitUrl: z.string().optional(),
      })
      .optional(),
    build: z.object({
      name: z.string(),
      version: z.string(),
      gitSha: z.string(),
    }),
  })
  .openapi('Meta_FrontendConfigResponse');

export const CodeRowWithSourceMetaSchema = z
  .object({
    code: z.string(),
    display: z.string(),
    sort_order: z.number(),
    is_active: z.boolean(),
    source: z.string(),
  })
  .openapi('Meta_CodeRowWithSource');

/** Response: object keyed by code set name, values = arrays of code rows with source */
export const CodesKeyedMetaResponseSchema = z
  .record(z.string(), z.array(CodeRowWithSourceMetaSchema))
  .openapi('Meta_CodesKeyedResponse');

export const ListCodesQuerySchema = z
  .object({
    code_set: z.string().optional(),
    source: z.string().optional(),
    is_active: z.enum(['true', 'false']).optional(),
    only_enabled_features: z.enum(['true', 'false']).optional(),
  })
  .openapi('Meta_ListCodesQuery');

export const FormEngineMetaSchema = z
  .object({
    id: z.string(),
    code: z.string(),
    name: z.string(),
    engineVersion: z.string().nullable(),
    isActive: z.boolean(),
    isDefault: z.boolean(),
    installedPlugin: z.boolean(),
  })
  .openapi('Meta_FormEngine');

export const FormEnginesMetaResponseSchema = z
  .object({
    items: z.array(FormEngineMetaSchema),
  })
  .openapi('Meta_FormEnginesResponse');

export const RoleWithSourceMetaSchema = z
  .object({
    roleCode: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    source: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi('Meta_RoleWithSource');

export const ListRolesQuerySchema = z
  .object({
    code: z.string().optional(),
    source: z.string().optional(),
    status: z.string().optional(),
    only_enabled_features: z.enum(['true', 'false']).optional(),
  })
  .openapi('Meta_ListRolesQuery');

export const RolesMetaResponseSchema = z
  .object({
    roles: z.array(RoleWithSourceMetaSchema),
  })
  .openapi('Meta_RolesResponse');

export const FilesConfigMetaResponseSchema = z
  .object({
    maxFileSizeMb: z.number(),
    blockedExtensions: z.array(z.string()),
  })
  .openapi('Meta_FilesConfigResponse');

export const registerMetaOpenApi = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'get',
    path: '/meta/plugins',
    tags: ['core.meta'],
    responses: {
      200: {
        description:
          'Discovered plugin catalog; the active plugin for each type is flagged enabled',
        content: {
          'application/json': {
            schema: PluginsMetaResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/meta/features',
    tags: ['core.meta'],
    responses: {
      200: {
        description: 'DB-backed feature list (code, name, status, availability, platformAllowed)',
        content: {
          'application/json': {
            schema: FeaturesMetaResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/meta/feature-availability',
    tags: ['core.meta'],
    request: { query: FeatureAvailabilityQuerySchema },
    responses: {
      200: {
        description:
          'Whether a feature is available for the given workspace/form scope (fixed → platform-enabled; scoped → an active grant).',
        content: { 'application/json': { schema: FeatureAvailabilityResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/meta/form-engines',
    tags: ['core.meta'],
    responses: {
      200: {
        description: 'Configured platform form engines and plugin installation status',
        content: {
          'application/json': {
            schema: FormEnginesMetaResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/meta/build',
    tags: ['core.meta'],
    responses: {
      200: {
        description: 'Build metadata (version and deployment identifiers)',
        content: {
          'application/json': {
            schema: BuildMetaResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/meta/frontend-config',
    tags: ['core.meta'],
    responses: {
      200: {
        description: 'Public runtime configuration needed by the frontend',
        content: {
          'application/json': {
            schema: FrontendConfigMetaResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/meta/codes',
    tags: ['core.meta'],
    request: {
      query: ListCodesQuerySchema,
    },
    responses: {
      200: {
        description:
          'Code sets keyed by name. Query: code_set (single or comma-separated), source, is_active, only_enabled_features.',
        content: {
          'application/json': {
            schema: CodesKeyedMetaResponseSchema,
            example: {
              form_status: [
                {
                  code: 'active',
                  display: 'Active',
                  sort_order: 0,
                  is_active: true,
                  source: 'core',
                },
                {
                  code: 'archived',
                  display: 'Archived',
                  sort_order: 1,
                  is_active: true,
                  source: 'core',
                },
              ],
            },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/meta/roles',
    tags: ['core.meta'],
    request: {
      query: ListRolesQuerySchema,
    },
    responses: {
      200: {
        description:
          'All roles (flat list). Query: code (comma-separated), source, status, only_enabled_features.',
        content: {
          'application/json': {
            schema: RolesMetaResponseSchema,
          },
        },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: '/meta/files-config',
    tags: ['core.meta'],
    responses: {
      200: {
        description: 'Files feature config (upload size limit + always-blocked extensions)',
        content: {
          'application/json': {
            schema: FilesConfigMetaResponseSchema,
          },
        },
      },
      404: { description: 'Files feature is disabled' },
    },
  });
};
