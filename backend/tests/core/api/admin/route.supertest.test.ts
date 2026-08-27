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

jest.mock('../../../../src/core/db/repos/sobaAdminRepo', () => ({
  listSobaAdmins: jest.fn(),
  addDirectSobaAdmin: jest.fn(),
  removeDirectSobaAdmin: jest.fn(),
}));

jest.mock('../../../../src/core/db/repos/featureScopeRepo', () => ({
  getFeatureScopeById: jest.fn(),
  listFeatureScopes: jest.fn(),
  removeFeatureScope: jest.fn(),
  upsertFeatureScope: jest.fn(),
}));

jest.mock('../../../../src/core/db/repos/documentGenerationAuditRepo', () => ({
  listDocumentGenerationAudits: jest.fn(),
}));

const getFeatureScopeByIdMock = jest.mocked(getFeatureScopeById);
const listFeatureScopesMock = jest.mocked(listFeatureScopes);
const removeFeatureScopeMock = jest.mocked(removeFeatureScope);
const upsertFeatureScopeMock = jest.mocked(upsertFeatureScope);

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
    listFeatureScopesMock.mockResolvedValue([featureScopeRow()]);
    getFeatureScopeByIdMock.mockResolvedValue(featureScopeRow());
    removeFeatureScopeMock.mockResolvedValue(undefined);
    upsertFeatureScopeMock.mockResolvedValue(featureScopeRow());
  });

  it('is blocked by the SOBA admin guard before route handlers run', async () => {
    const res = await request(createAdminApp(false)).get('/feature-scopes');

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'SOBA platform admin required' });
    expect(listFeatureScopesMock).not.toHaveBeenCalled();
  });

  it('validates list query limit bounds', async () => {
    const res = await request(createAdminApp(true)).get('/feature-scopes?limit=201');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid request query');
    expect(listFeatureScopesMock).not.toHaveBeenCalled();
  });

  it('validates list query enums', async () => {
    const res = await request(createAdminApp(true)).get('/feature-scopes?scopeType=group');

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
    });
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
