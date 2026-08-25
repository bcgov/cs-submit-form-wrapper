import {
  FormioEngineAdapter,
  buildSubmissionBody,
} from '../../../src/plugins/formio-v5/formioEngineAdapter';
import type { PluginConfigReader } from '../../../src/core/config/pluginConfig';
import { getAuthenticatedFormioClient } from '../../../src/plugins/formio-v5/formioV5Client';
import { ValidationError } from '../../../src/core/errors';

jest.mock('../../../src/plugins/formio-v5/formioV5Client', () => ({
  getAuthenticatedFormioClient: jest.fn(),
}));

const mockedGetClient = getAuthenticatedFormioClient as unknown as jest.Mock;

function makeConfig(): PluginConfigReader {
  return {
    getRequired: (key: string) => `val-${key}`,
    getOptional: () => undefined,
  } as unknown as PluginConfigReader;
}

interface FakeClient {
  loadSubmissions: jest.Mock;
  loadSubmission: jest.Mock;
  saveSubmission: jest.Mock;
  deleteSubmission: jest.Mock;
}

function makeClient(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    loadSubmissions: jest.fn().mockResolvedValue([]),
    loadSubmission: jest.fn().mockResolvedValue({ _id: 'sub-1', data: { a: 1 } }),
    saveSubmission: jest.fn().mockResolvedValue({ _id: 'sub-new' }),
    deleteSubmission: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const createInput = {
  engineFormRef: 'form-ref-1',
  submissionId: 's1',
  revisionNo: 3,
  workspaceId: 'ws1',
  data: { firstName: 'Ada' },
};

describe('FormioEngineAdapter submission methods', () => {
  beforeEach(() => jest.clearAllMocks());

  it('buildSubmissionBody keeps answers clean in data and puts the correlation key in metadata', () => {
    const body = buildSubmissionBody(createInput);
    // Form.io strips non-component data keys, so the correlation key must NOT be in data.
    expect(body.data).toEqual({ firstName: 'Ada' });
    expect(body.metadata).toEqual({
      soba_workspace_id: 'ws1',
      soba_submission_id: 's1',
      soba_revision_no: 3,
      soba_revision_key: 'soba-s1-r3',
    });
  });

  it('buildSubmissionBody does not mutate the input data', () => {
    const data = { firstName: 'Ada' };
    buildSubmissionBody({ ...createInput, data });
    expect(data).toEqual({ firstName: 'Ada' });
  });

  it('creates a new submission document and returns its engine ref', async () => {
    const client = makeClient({
      loadSubmissions: jest.fn().mockResolvedValue([]),
      saveSubmission: jest.fn().mockResolvedValue({ _id: 'sub-new' }),
    });
    mockedGetClient.mockResolvedValue(client);

    const adapter = new FormioEngineAdapter(makeConfig());
    const res = await adapter.createSubmission(createInput);

    expect(res).toEqual({ engineRef: 'sub-new' });
    expect(client.loadSubmissions).toHaveBeenCalledWith('form-ref-1', {
      params: { 'metadata.soba_revision_key': 'soba-s1-r3' },
    });
    const body = client.saveSubmission.mock.calls[0][1] as Record<string, unknown>;
    expect(body._id).toBeUndefined(); // POST (new doc), not PUT
  });

  it('is idempotent: a retry for the same revision returns the existing doc without re-saving', async () => {
    const client = makeClient({
      loadSubmissions: jest.fn().mockResolvedValue([{ _id: 'sub-existing' }]),
    });
    mockedGetClient.mockResolvedValue(client);

    const adapter = new FormioEngineAdapter(makeConfig());
    const res = await adapter.createSubmission(createInput);

    expect(res).toEqual({ engineRef: 'sub-existing' });
    expect(client.saveSubmission).not.toHaveBeenCalled();
  });

  it('maps a Form.io 4xx rejection to a ValidationError', async () => {
    const client = makeClient({
      saveSubmission: jest.fn().mockRejectedValue({ status: 400, message: 'invalid submission' }),
    });
    mockedGetClient.mockResolvedValue(client);

    const adapter = new FormioEngineAdapter(makeConfig());
    await expect(adapter.createSubmission(createInput)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws when no admin client is available', async () => {
    mockedGetClient.mockResolvedValue(null);
    const adapter = new FormioEngineAdapter(makeConfig());
    await expect(adapter.createSubmission(createInput)).rejects.toThrow(/admin client/i);
  });

  it('readSubmission strips engine-managed fields and the SOBA metadata', async () => {
    const client = makeClient({
      loadSubmission: jest.fn().mockResolvedValue({
        _id: 'sub-1',
        owner: 'o',
        created: 'c',
        data: { firstName: 'Ada' },
        metadata: { soba_revision_key: 'soba-s1-r3', headers: { host: 'x' } },
      }),
    });
    mockedGetClient.mockResolvedValue(client);

    const adapter = new FormioEngineAdapter(makeConfig());
    const result = await adapter.readSubmission('form-ref-1', 'sub-1');

    expect(client.loadSubmission).toHaveBeenCalledWith('form-ref-1', 'sub-1');
    expect(result).toEqual({ data: { firstName: 'Ada' } });
  });

  it('readSubmission returns null when the document is not found', async () => {
    const client = makeClient({ loadSubmission: jest.fn().mockResolvedValue(null) });
    mockedGetClient.mockResolvedValue(client);
    const adapter = new FormioEngineAdapter(makeConfig());
    expect(await adapter.readSubmission('form-ref-1', 'missing')).toBeNull();
  });

  it('deleteSubmission deletes the document under its form', async () => {
    const client = makeClient();
    mockedGetClient.mockResolvedValue(client);

    const adapter = new FormioEngineAdapter(makeConfig());
    await adapter.deleteSubmission('form-ref-1', 'sub-1');

    expect(client.deleteSubmission).toHaveBeenCalledWith('form-ref-1', 'sub-1');
  });

  it('deleteSubmission throws when no admin client is available', async () => {
    mockedGetClient.mockResolvedValue(null);
    const adapter = new FormioEngineAdapter(makeConfig());
    await expect(adapter.deleteSubmission('form-ref-1', 'sub-1')).rejects.toThrow(/admin client/i);
  });
});
