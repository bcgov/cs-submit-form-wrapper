import { createEnvReader } from '../../../../src/core/config/env';
import {
  createPluginConfigReaderFrom,
  type PluginConfigReader,
} from '../../../../src/core/config/pluginConfig';
import {
  createRedisClient,
  optionalNumber,
  type RedisConnection,
} from '../../../../src/plugins/shared/redis/redisClient';

// No mocks and no running backend: build the real ioredis client via the real config reader, point
// it at a closed local port, and assert on the client's actual constructed state and whenReady's
// real promise behaviour. Anything that needs a *successful* connection is covered by integration
// tests, not here. retryStrategy is overridden to give up after the first refused connection so no
// reconnect timer outlives the test (production reconnects forever to auto-recover).

const CODE = 'test-redis';

const config = (source: Record<string, string>): PluginConfigReader =>
  createPluginConfigReaderFrom(createEnvReader(source), CODE);

function buildUnreachable(
  source: Record<string, string> = {},
  options: { keyPrefix?: string; extra?: Record<string, unknown> } = {},
): RedisConnection {
  const conn = createRedisClient(
    config({
      PLUGIN_TEST_REDIS_URL: 'redis://127.0.0.1:1',
      PLUGIN_TEST_REDIS_CONNECT_TIMEOUT_MS: '200',
      ...source,
    }),
    { logLabel: CODE, ...options },
  );
  conn.client.options.retryStrategy = () => null;
  return conn;
}

describe('createRedisClient', () => {
  it('disables the offline queue and caps per-request retries (fail fast, not hang)', () => {
    const { client } = buildUnreachable();
    expect(client.options.enableOfflineQueue).toBe(false);
    expect(client.options.maxRetriesPerRequest).toBe(1);
  });

  it('applies keyPrefix when given and leaves it unprefixed when omitted', () => {
    expect(buildUnreachable({}, { keyPrefix: 'soba:' }).client.options.keyPrefix).toBe('soba:');
    // Omitted must be falsy so pub/sub channel names are never prefixed.
    expect(buildUnreachable().client.options.keyPrefix).toBeFalsy();
  });

  it('reads connect and command timeouts from config', () => {
    const { client } = buildUnreachable({
      PLUGIN_TEST_REDIS_CONNECT_TIMEOUT_MS: '250',
      PLUGIN_TEST_REDIS_COMMAND_TIMEOUT_MS: '750',
    });
    expect(client.options.connectTimeout).toBe(250);
    expect(client.options.commandTimeout).toBe(750);
  });

  it('lets extra options override the base options', () => {
    const { client } = buildUnreachable(
      { PLUGIN_TEST_REDIS_COMMAND_TIMEOUT_MS: '750' },
      { extra: { commandTimeout: 12345 } },
    );
    expect(client.options.commandTimeout).toBe(12345);
  });

  it('attaches an error listener so backend errors do not go unhandled', () => {
    const { client } = buildUnreachable();
    expect(client.listenerCount('error')).toBeGreaterThanOrEqual(1);
  });

  it('whenReady rejects when the backend never becomes ready', async () => {
    const { whenReady } = buildUnreachable();
    await expect(whenReady()).rejects.toThrow();
  });
});

describe('optionalNumber', () => {
  it('parses the configured value when set', () => {
    expect(optionalNumber(config({ PLUGIN_TEST_REDIS_TTL_MS: '1500' }), 'TTL_MS', 99)).toBe(1500);
  });

  it('falls back to the default when unset', () => {
    expect(optionalNumber(config({}), 'TTL_MS', 99)).toBe(99);
  });
});
