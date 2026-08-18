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

// Client and adapter are real; only the subscriber's SUBSCRIBE is stubbed. An unreachable backend
// queues it offline rather than rejecting, so it is the one way to reach the failure branch here.
describe('messagebus-redis (SUBSCRIBE failure)', () => {
  let built: ReturnType<typeof unreachableAdapter>;
  let subscribe: jest.SpiedFunction<Redis['subscribe']>;

  beforeEach(() => {
    built = unreachableAdapter();
    subscribe = jest.spyOn(built.subscriber, 'subscribe');
  });

  afterEach(() => {
    subscribe.mockRestore();
  });

  const failOnce = (): void => {
    subscribe
      .mockRejectedValueOnce(new Error('Connection is closed.'))
      .mockResolvedValue(1 as never);
  };

  it('re-issues SUBSCRIBE for a later subscriber when the first attempt failed', async () => {
    failOnce();

    built.adapter.subscribe!('t', async () => undefined);
    await Promise.resolve(); // let the rejection settle
    built.adapter.subscribe!('t', async () => undefined);

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenNthCalledWith(2, 'soba:t');
  });

  it('re-issues a failed SUBSCRIBE on the next connect, with no new subscriber', async () => {
    failOnce();

    built.adapter.subscribe!('t', async () => undefined);
    await Promise.resolve();
    built.subscriber.emit('ready');

    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('does not re-issue SUBSCRIBE for a channel that is already subscribed', () => {
    subscribe.mockResolvedValue(1 as never);

    built.adapter.subscribe!('t', async () => undefined);
    built.adapter.subscribe!('t', async () => undefined);
    built.subscriber.emit('ready');

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not re-issue SUBSCRIBE for a channel whose last handler unsubscribed', () => {
    subscribe.mockResolvedValue(1 as never);
    jest.spyOn(built.subscriber, 'unsubscribe').mockResolvedValue(0 as never);

    const unsubscribe = built.adapter.subscribe!('t', async () => undefined);
    (unsubscribe as () => void)();
    built.subscriber.emit('ready');

    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
