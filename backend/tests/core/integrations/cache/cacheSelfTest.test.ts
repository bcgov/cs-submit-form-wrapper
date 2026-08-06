import { createEnvReader } from '../../../../src/core/config/env';
import {
  createPluginConfigReader,
  createPluginConfigReaderFrom,
} from '../../../../src/core/config/pluginConfig';
import { cacheSelfTest } from '../../../../src/core/integrations/cache/cacheSelfTest';
import { cachePluginDefinition } from '../../../../src/plugins/cache-memory';
import { buildRedisCacheAdapter } from '../../../../src/plugins/cache-redis';

describe('cacheSelfTest', () => {
  it('reports a successful round-trip against the in-memory cache', async () => {
    const adapter = cachePluginDefinition.createAdapter(
      createPluginConfigReader(cachePluginDefinition.code),
    );

    const result = await cacheSelfTest(adapter);

    expect(result.roundTrip).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it('reports failure with a message when the backend is unreachable', async () => {
    // Real cache-redis adapter at a closed port — exercises the actual not-ready path, no mocks.
    const config = createPluginConfigReaderFrom(
      createEnvReader({
        PLUGIN_CACHE_REDIS_URL: 'redis://127.0.0.1:1',
        PLUGIN_CACHE_REDIS_CONNECT_TIMEOUT_MS: '200',
      }),
      'cache-redis',
    );
    const { adapter, client } = buildRedisCacheAdapter(config);
    // Give up after the first refused connection so the client ends itself and no reconnect timer
    // outlives the test (prod reconnects forever to auto-recover); no disconnect() needed.
    client.options.retryStrategy = () => null;

    const result = await cacheSelfTest(adapter);

    expect(result.roundTrip).toBe(false);
    expect(result.message).toBeTruthy();
  });
});
