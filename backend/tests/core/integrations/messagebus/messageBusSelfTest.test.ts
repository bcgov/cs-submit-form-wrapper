import { createEnvReader } from '../../../../src/core/config/env';
import {
  createPluginConfigReader,
  createPluginConfigReaderFrom,
} from '../../../../src/core/config/pluginConfig';
import { messageBusSelfTest } from '../../../../src/core/integrations/messagebus/messageBusSelfTest';
import { messagebusPluginDefinition } from '../../../../src/plugins/messagebus-memory';
import { buildRedisMessageBusAdapter } from '../../../../src/plugins/messagebus-redis';
import type { MessageBusAdapter } from '../../../../src/core/integrations/messagebus/MessageBusAdapter';

describe('messageBusSelfTest', () => {
  it('reports delivery against the in-memory bus', async () => {
    const adapter = messagebusPluginDefinition.createAdapter(
      createPluginConfigReader(messagebusPluginDefinition.code),
    );

    const result = await messageBusSelfTest(adapter);

    expect(result.delivered).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it('reports failure with a message when the backend is unreachable', async () => {
    // Real messagebus-redis adapter at a closed port — exercises the readiness fast-fail path, no
    // mocks. retryStrategy gives up after the first refused connection so no timer outlives the test.
    const config = createPluginConfigReaderFrom(
      createEnvReader({
        PLUGIN_MESSAGEBUS_REDIS_URL: 'redis://127.0.0.1:1',
        PLUGIN_MESSAGEBUS_REDIS_CONNECT_TIMEOUT_MS: '200',
      }),
      'messagebus-redis',
    );
    const { adapter, publisher, subscriber } = buildRedisMessageBusAdapter(config);
    publisher.options.retryStrategy = () => null;
    subscriber.options.retryStrategy = () => null;

    const result = await messageBusSelfTest(adapter);

    expect(result.delivered).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('reports failure when the adapter cannot subscribe', async () => {
    const publishOnly: MessageBusAdapter = { publish: async () => undefined };

    const result = await messageBusSelfTest(publishOnly);

    expect(result.delivered).toBe(false);
    expect(result.message).toBeTruthy();
  });
});
