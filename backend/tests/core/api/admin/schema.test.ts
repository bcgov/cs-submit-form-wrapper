import {
  FeatureScopeIdParamsSchema,
  ListDocumentGenerationAuditsQuerySchema,
  ListFeatureScopesQuerySchema,
  UpsertFeatureScopeBodySchema,
} from '../../../../src/core/api/admin/schema';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('admin schemas', () => {
  it('ListFeatureScopesQuerySchema coerces/defaults limit and accepts valid enum filters', () => {
    const result = ListFeatureScopesQuerySchema.safeParse({
      featureCode: 'document-generation-v3',
      scopeType: 'workspace',
      status: 'active',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      featureCode: 'document-generation-v3',
      scopeType: 'workspace',
      status: 'active',
      limit: 100,
    });
  });

  it('ListFeatureScopesQuerySchema rejects out-of-range limits', () => {
    expect(ListFeatureScopesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(ListFeatureScopesQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
  });

  it('ListFeatureScopesQuerySchema rejects invalid enum filters', () => {
    expect(ListFeatureScopesQuerySchema.safeParse({ scopeType: 'workspace-group' }).success).toBe(
      false,
    );
    expect(ListFeatureScopesQuerySchema.safeParse({ status: 'deleted' }).success).toBe(false);
  });

  it('FeatureScopeIdParamsSchema accepts uuid feature scope ids and rejects other values', () => {
    expect(FeatureScopeIdParamsSchema.safeParse({ featureScopeId: UUID }).success).toBe(true);
    expect(FeatureScopeIdParamsSchema.safeParse({ featureScopeId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('UpsertFeatureScopeBodySchema accepts valid workspace/form scopes and rejects invalid enum values', () => {
    expect(
      UpsertFeatureScopeBodySchema.safeParse({
        featureCode: 'document-generation-v3',
        scopeType: 'form',
        scopeId: UUID,
        status: 'inactive',
      }).success,
    ).toBe(true);
    expect(
      UpsertFeatureScopeBodySchema.safeParse({
        featureCode: 'document-generation-v3',
        scopeType: 'workspace',
        scopeId: UUID,
        status: 'deleted',
      }).success,
    ).toBe(false);
  });

  it('ListDocumentGenerationAuditsQuerySchema requires a workspace or form filter and bounds limit', () => {
    expect(ListDocumentGenerationAuditsQuerySchema.safeParse({ limit: 10 }).success).toBe(false);
    expect(
      ListDocumentGenerationAuditsQuerySchema.safeParse({ workspaceId: UUID, limit: 200 }).success,
    ).toBe(true);
    expect(
      ListDocumentGenerationAuditsQuerySchema.safeParse({ workspaceId: UUID, limit: 201 }).success,
    ).toBe(false);
  });
});
