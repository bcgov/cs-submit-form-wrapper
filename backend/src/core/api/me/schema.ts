import { extendZodWithOpenApi, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const MeActorSchema = z
  .object({
    id: z.string(),
    displayLabel: z.string().nullable(),
    status: z.string(),
  })
  .openapi('Me_Actor');

export const MeProfileSchema = z
  .object({
    displayName: z.string().nullable(),
    email: z.string().nullable(),
    preferredUsername: z.string().nullable(),
  })
  .openapi('Me_Profile');

export const MePreferencesSchema = z
  .object({
    defaultWorkspaceId: z.string().uuid().nullable().optional(),
  })
  .openapi('Me_Preferences');

export const MeCapabilitiesSchema = z
  .object({
    canCreateWorkspace: z.boolean(),
    /** Platform admin via the soba_admin table: IdP-sourced or granted directly. */
    isSobaAdmin: z.boolean(),
  })
  .openapi('Me_Capabilities');

export const MeResponseSchema = z
  .object({
    actor: MeActorSchema,
    profile: MeProfileSchema,
    preferences: MePreferencesSchema,
    capabilities: MeCapabilitiesSchema,
  })
  .openapi('Me_Response');

export const PatchMeBodySchema = z
  .object({
    preferences: MePreferencesSchema,
  })
  .openapi('Me_PatchBody');

export const registerMeOpenApi = (registry: OpenAPIRegistry) => {
  registry.registerPath({
    method: 'get',
    path: '/me',
    tags: ['core.me'],
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: 'Current authenticated actor with backend-resolved profile fields',
        content: {
          'application/json': {
            schema: MeResponseSchema,
          },
        },
      },
      404: {
        description: 'Current actor not found',
      },
    },
  });

  registry.registerPath({
    method: 'patch',
    path: '/me',
    tags: ['core.me'],
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: PatchMeBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Updated current actor preferences',
        content: {
          'application/json': {
            schema: MeResponseSchema,
          },
        },
      },
      400: {
        description: 'Invalid request body',
      },
      403: {
        description: 'Not a member of the requested workspace',
      },
      404: {
        description: 'Current actor not found',
      },
    },
  });
};
