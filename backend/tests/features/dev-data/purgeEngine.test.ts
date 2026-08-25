import { FormioEngineAdapter } from '../../../src/plugins/formio-v5/formioEngineAdapter';
import type { PluginConfigReader } from '../../../src/core/config/pluginConfig';
import { getAuthenticatedFormioClient } from '../../../src/plugins/formio-v5/formioV5Client';

jest.mock('../../../src/plugins/formio-v5/formioV5Client', () => ({
  getAuthenticatedFormioClient: jest.fn(),
}));

const mockedGetClient = getAuthenticatedFormioClient as unknown as jest.Mock;

const config = { getRequired: (k: string) => `val-${k}`, getOptional: () => undefined };

/**
 * Purge resolves the adapter and calls its delete methods. They are prototype methods that read
 * this.pluginConfig, so calling them detached from the instance throws and purge silently records
 * an engine failure instead of deleting anything.
 */
describe('form engine delete methods survive how purge calls them', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['deleteSubmission', (a: FormioEngineAdapter) => a.deleteSubmission('form-1', 'sub-1')],
    ['deleteSchema', (a: FormioEngineAdapter) => a.deleteSchema('form-1')],
  ])('%s works when invoked on the adapter', async (_name, call) => {
    mockedGetClient.mockResolvedValue({
      deleteSubmission: jest.fn().mockResolvedValue(undefined),
      deleteForm: jest.fn().mockResolvedValue(undefined),
    });

    await expect(
      call(new FormioEngineAdapter(config as unknown as PluginConfigReader)),
    ).resolves.toBeUndefined();
  });

  it.each(['deleteSubmission', 'deleteSchema'] as const)(
    '%s throws when detached from the adapter, which is why purge must not do that',
    async (method) => {
      mockedGetClient.mockResolvedValue({
        deleteSubmission: jest.fn(),
        deleteForm: jest.fn(),
      });

      const adapter = new FormioEngineAdapter(config as unknown as PluginConfigReader);
      const detached = adapter[method] as (...args: string[]) => Promise<void>;

      await expect(detached('form-1', 'sub-1')).rejects.toThrow(TypeError);
    },
  );
});
