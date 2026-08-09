import type Redis from 'ioredis';
import { createEnvReader } from '../../../src/core/config/env';
import { createPluginConfigReaderFrom } from '../../../src/core/config/pluginConfig';
import {
  buildRedisMessageBusAdapter,
  messagebusPluginDefinition,
} from '../../../src/plugins/messagebus-redis';

// Points the adapter at a closed local port so connections are refused fast. No mocks: this
// exercises the real best-effort path (unreachable backend must not throw), which is the at-most-
// once guarantee. retryStrategy is overridden to give up after the first failure so no reconnect
// timer outlives the test (production reconnects forever to auto-recover).
function unreachableAdapter(): {
  adapter: ReturnType<typeof buildRedisMessageBusAdapter>['adapter'];
  publisher: Redis;
  subscriber: Redis;
} {
  const source = {
    PLUGIN_MESSAGEBUS_REDIS_URL: 'redis://127.0.0.1:1',
    PLUGIN_MESSAGEBUS_REDIS_CONNECT_TIMEOUT_MS: '200',
  };
  const config = createPluginConfigReaderFrom(createEnvReader(source), 'messagebus-redis');
  const built = buildRedisMessageBusAdapter(config);
  built.publisher.options.retryStrategy = () => null;
  built.subscriber.options.retryStrategy = () => null;
  return built;
}

describe('messagebus-redis definition', () => {
  it('has the expected code', () => {
    expect(messagebusPluginDefinition.code).toBe('messagebus-redis');
  });
});

describe('messagebus-redis (backend unreachable)', () => {
  let adapter: ReturnType<typeof unreachableAdapter>['adapter'];

  beforeEach(() => {
    ({ adapter } = unreachableAdapter());
  });

  it('publish resolves rather than throwing when the backend is down', async () => {
    await expect(adapter.publish('submission.saved', { id: 'abc' })).resolves.toBeUndefined();
  });

  it('subscribe returns an unsubscribe function and neither throws', () => {
    let unsubscribe: (() => void) | void;
    expect(() => {
      unsubscribe = adapter.subscribe!('t', async () => undefined);
    }).not.toThrow();
    expect(typeof unsubscribe).toBe('function');
    expect(() => (unsubscribe as () => void)()).not.toThrow();
  });
});
