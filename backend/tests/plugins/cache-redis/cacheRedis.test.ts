import type Redis from 'ioredis';
import { createEnvReader } from '../../../src/core/config/env';
import { createPluginConfigReaderFrom } from '../../../src/core/config/pluginConfig';
import { buildRedisCacheAdapter, cachePluginDefinition } from '../../../src/plugins/cache-redis';

// Points the adapter at a closed local port so connections are refused fast. No mocks: this
// exercises the real fall-through path (unreachable backend -> source of truth), which is the
// resilience guarantee the ticket requires. Production reconnects forever (to auto-recover); a
// test client must not, or its reconnect timer outlives the test and the runner never quits — so
// override retryStrategy to give up after the first failure. The client is returned so teardown
// can disconnect the (now idle) socket.
function unreachableAdapter(): {
  adapter: ReturnType<typeof buildRedisCacheAdapter>['adapter'];
  client: Redis;
} {
  const source = {
    PLUGIN_CACHE_REDIS_URL: 'redis://127.0.0.1:1',
    PLUGIN_CACHE_REDIS_CONNECT_TIMEOUT_MS: '200',
  };
  const config = createPluginConfigReaderFrom(createEnvReader(source), 'cache-redis');
  const built = buildRedisCacheAdapter(config);
  built.client.options.retryStrategy = () => null;
  return built;
}

describe('cache-redis definition', () => {
  it('has the expected code', () => {
    expect(cachePluginDefinition.code).toBe('cache-redis');
  });
});

describe('cache-redis (backend unreachable)', () => {
  let adapter: ReturnType<typeof unreachableAdapter>['adapter'];

  beforeEach(() => {
    // retryStrategy is overridden to give up on the first failure, so the client ends itself after
    // the refused connection — no teardown/disconnect needed (disconnect() would arm its own timer).
    ({ adapter } = unreachableAdapter());
  });

  it('get resolves null rather than throwing', async () => {
    await expect(adapter.get('membership:ws:user')).resolves.toBeNull();
  });

  it('getOrSet falls through to the factory and returns its value', async () => {
    const factory = jest.fn().mockResolvedValue({ role: 'owner' });
    await expect(adapter.getOrSet!('membership:ws:user', factory)).resolves.toEqual({
      role: 'owner',
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('getOrSet propagates factory (source-of-truth) errors', async () => {
    const factory = jest.fn().mockRejectedValue(new Error('db down'));
    await expect(adapter.getOrSet!('membership:ws:user', factory)).rejects.toThrow('db down');
  });

  it('set and delete resolve without throwing', async () => {
    await expect(adapter.set('k', { a: 1 }, 1000)).resolves.toBeUndefined();
    await expect(adapter.delete('k')).resolves.toBeUndefined();
  });

  it('readinessCheck reports not-ok with a message', async () => {
    const result = await adapter.readinessCheck!();
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});
