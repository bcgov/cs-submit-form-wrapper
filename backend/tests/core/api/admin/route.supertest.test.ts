import express from 'express';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { adminRouter } from '../../../../src/core/api/admin';
import { coreErrorHandler } from '../../../../src/core/middleware/errorHandler';
import { requireSobaAdmin } from '../../../../src/core/middleware/requireSobaAdmin';
import {
  getFeatureScopeById,
  listFeatureScopes,
  removeFeatureScope,
  upsertFeatureScope,
} from '../../../../src/core/db/repos/featureScopeRepo';
import { getFeatureGateCached } from '../../../../src/core/db/repos/featureRepo';
import {
  addDirectSobaAdmin,
  removeDirectSobaAdmin,
} from '../../../../src/core/db/repos/sobaAdminRepo';
import { findAppUserById } from '../../../../src/core/db/repos/appUserRepo';

// Each route's query schema reads its sort fields from the repo module at import time, so a mock
// that omits them leaves the schema building an enum over undefined.
jest.mock('../../../../src/core/db/repos/sobaAdminRepo', () => ({
  SOBA_ADMIN_SORT_FIELDS: ['displayLabel', 'source', 'syncedAt'],
  listSobaAdmins: jest.fn(),
  addDirectSobaAdmin: jest.fn(),
  removeDirectSobaAdmin: jest.fn(),
}));

jest.mock('../../../../src/core/db/repos/featureScopeRepo', () => ({
  FEATURE_SCOPE_SORT_FIELDS: ['featureCode', 'scopeType', 'status', 'createdAt', 'updatedAt'],
  getFeatureScopeById: jest.fn(),
  listFeatureScopes: jest.fn(),
  removeFeatureScope: jest.fn(),
  upsertFeatureScope: jest.fn(),
}));

jest.mock('../../../../src/core/db/repos/documentGenerationAuditRepo', () => ({
  DOCGEN_AUDIT_SORT_FIELDS: ['createdAt', 'outcome', 'durationMs'],
  listDocumentGenerationAudits: jest.fn(),
}));

jest.mock('../../../../src/core/db/repos/featureRepo', () => ({
  getFeatureGateCached: jest.fn(),
  isFeatureEnabledCached: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../../src/core/db/repos/appUserRepo', () => ({
  findAppUserById: jest.fn(),
}));

const getFeatureScopeByIdMock = jest.mocked(getFeatureScopeById);
const listFeatureScopesMock = jest.mocked(listFeatureScopes);
const removeFeatureScopeMock = jest.mocked(removeFeatureScope);
const upsertFeatureScopeMock = jest.mocked(upsertFeatureScope);
const getFeatureGateCachedMock = jest.mocked(getFeatureGateCached);
const removeDirectSobaAdminMock = jest.mocked(removeDirectSobaAdmin);
const addDirectSobaAdminMock = jest.mocked(addDirectSobaAdmin);
const findAppUserByIdMock = jest.mocked(findAppUserById);

const FEATURE_SCOPE_ID = '11111111-1111-4111-8111-111111111111';
const SCOPE_ID = '22222222-2222-4222-8222-222222222222';

function createAdminApp(isSobaAdmin: boolean) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.isSobaAdmin = isSobaAdmin;
    next();
  });
  app.use(requireSobaAdmin, adminRouter);
  app.use(coreErrorHandler);
  return app;
}

function featureScopeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FEATURE_SCOPE_ID,
    featureCode: 'document-generation-v3',
    scopeType: 'workspace',
    scopeId: SCOPE_ID,
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    createdBy: null,
    updatedBy: null,
    ...overrides,
  } as never;
}

describe('adminRouter feature-scope routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listFeatureScopesMock.mockResolvedValue({ items: [featureScopeRow()], total: 1 });
    getFeatureScopeByIdMock.mockResolvedValue(featureScopeRow());
    removeFeatureScopeMock.mockResolvedValue(true);
    upsertFeatureScopeMock.mockResolvedValue(featureScopeRow());
    getFeatureGateCachedMock.mockResolvedValue({ enabled: true, availability: 'scoped' });
    removeDirectSobaAdminMock.mockResolvedValue(true);
    addDirectSobaAdminMock.mockResolvedValue(undefined);
    findAppUserByIdMock.mockResolvedValue({ id: SCOPE_ID } as never);
  });

  it('is blocked by the SOBA admin guard before route handlers run', async () => {
    const res = await request(createAdminApp(false)).get('/feature-scopes');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'SOBA platform admin required' });
    expect(listFeatureScopesMock).not.toHaveBeenCalled();
  });

  it.each([
    ['limit bounds', '/feature-scopes?limit=201'],
    ['enums', '/feature-scopes?scopeType=group'],
  ])('validates list query %s', async (_scenario, url) => {
    const res = await request(createAdminApp(true)).get(url);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request query');
    expect(listFeatureScopesMock).not.toHaveBeenCalled();
  });

  it('lists feature scopes with serialized date fields', async () => {
    const res = await request(createAdminApp(true)).get('/feature-scopes?limit=50&status=active');

    expect(res.status).toBe(200);
    expect(listFeatureScopesMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50, status: 'active' }),
    );
    expect(res.body).toEqual({
      items: [
        expect.objectContaining({
          id: FEATURE_SCOPE_ID,
          featureCode: 'document-generation-v3',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        }),
      ],
      page: { offset: 0, limit: 50, total: 1 },
      filters: { status: 'active' },
      sort: 'updatedAt:desc',
    });
  });

  it('reports the page it returned and the total behind it', async () => {
    listFeatureScopesMock.mockResolvedValue({ items: [featureScopeRow()], total: 42 });

    const res = await request(createAdminApp(true)).get('/feature-scopes?limit=1&offset=10');

    expect(res.status).toBe(200);
    expect(res.body.page).toEqual({ offset: 10, limit: 1, total: 42 });
  });

  it('returns 404 for an unknown feature scope id', async () => {
    getFeatureScopeByIdMock.mockResolvedValue(null);

    const res = await request(createAdminApp(true)).get(`/feature-scopes/${FEATURE_SCOPE_ID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Feature scope not found' });
  });

  it('validates feature scope id params for read/delete routes', async () => {
    const readRes = await request(createAdminApp(true)).get('/feature-scopes/not-a-uuid');
    const deleteRes = await request(createAdminApp(true)).delete('/feature-scopes/not-a-uuid');

    expect(readRes.status).toBe(400);
    expect(deleteRes.status).toBe(400);
    expect(getFeatureScopeByIdMock).not.toHaveBeenCalled();
    expect(removeFeatureScopeMock).not.toHaveBeenCalled();
  });

  it('deletes a feature scope by id', async () => {
    const res = await request(createAdminApp(true)).delete(`/feature-scopes/${FEATURE_SCOPE_ID}`);

    expect(res.status).toBe(204);
    expect(removeFeatureScopeMock).toHaveBeenCalledWith(FEATURE_SCOPE_ID);
  });

  it('returns 404 when deleting an id that matched no feature scope', async () => {
    removeFeatureScopeMock.mockResolvedValue(false);

    const res = await request(createAdminApp(true)).delete(`/feature-scopes/${FEATURE_SCOPE_ID}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Feature scope not found' });
  });

  it.each([
    [204, true],
    [404, false],
  ])('answers %s when removing a direct admin returns %s', async (status, removed) => {
    removeDirectSobaAdminMock.mockResolvedValue(removed);

    const res = await request(createAdminApp(true)).delete(`/soba-admins/${SCOPE_ID}`);

    expect(res.status).toBe(status);
  });

  it('adds a direct admin for a known user', async () => {
    const res = await request(createAdminApp(true)).post('/soba-admins').send({ userId: SCOPE_ID });

    expect(res.status).toBe(204);
    expect(addDirectSobaAdminMock).toHaveBeenCalledWith(SCOPE_ID, null);
  });

  // user_id is a foreign key; without this check the driver error reaches the caller as a 500.
  it('rejects an unknown user before it reaches the database', async () => {
    findAppUserByIdMock.mockResolvedValue(null);

    const res = await request(createAdminApp(true)).post('/soba-admins').send({ userId: SCOPE_ID });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`Unknown user: ${SCOPE_ID}`);
    expect(addDirectSobaAdminMock).not.toHaveBeenCalled();
  });

  it('upserts a scoped feature grant', async () => {
    const res = await request(createAdminApp(true)).post('/feature-scopes').send({
      featureCode: 'document-generation-v3',
      scopeType: 'workspace',
      scopeId: SCOPE_ID,
      status: 'active',
    });

    expect(res.status).toBe(204);
    expect(upsertFeatureScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ featureCode: 'document-generation-v3', status: 'active' }),
    );
  });

  it('rejects an unknown feature code before it reaches the database', async () => {
    getFeatureGateCachedMock.mockResolvedValue(null);

    const res = await request(createAdminApp(true)).post('/feature-scopes').send({
      featureCode: 'not-a-feature',
      scopeType: 'workspace',
      scopeId: SCOPE_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Unknown feature code: not-a-feature');
    expect(upsertFeatureScopeMock).not.toHaveBeenCalled();
  });

  it('rejects a grant for a feature that is not scoped', async () => {
    getFeatureGateCachedMock.mockResolvedValue({ enabled: true, availability: 'fixed' });

    const res = await request(createAdminApp(true)).post('/feature-scopes').send({
      featureCode: 'document-generation-v2',
      scopeType: 'workspace',
      scopeId: SCOPE_ID,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Feature is not scoped: document-generation-v2');
    expect(upsertFeatureScopeMock).not.toHaveBeenCalled();
  });

  it('validates upsert body enums and uuid fields', async () => {
    const res = await request(createAdminApp(true)).post('/feature-scopes').send({
      featureCode: 'document-generation-v3',
      scopeType: 'group',
      scopeId: SCOPE_ID,
      status: 'active',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request body');
    expect(upsertFeatureScopeMock).not.toHaveBeenCalled();
  });
});
