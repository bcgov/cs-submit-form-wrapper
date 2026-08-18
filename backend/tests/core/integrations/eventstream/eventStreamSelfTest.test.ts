import { createEnvReader } from '../../../../src/core/config/env';
import {
  createPluginConfigReader,
  createPluginConfigReaderFrom,
} from '../../../../src/core/config/pluginConfig';
import { eventStreamSelfTest } from '../../../../src/core/integrations/eventstream/eventStreamSelfTest';
import { eventStreamPluginDefinition } from '../../../../src/plugins/eventstream-memory';
import { buildRedisEventStreamAdapter } from '../../../../src/plugins/eventstream-redis';

describe('eventStreamSelfTest', () => {
  it('reports delivery against the in-memory stream', async () => {
    const adapter = eventStreamPluginDefinition.createAdapter(
      createPluginConfigReader(eventStreamPluginDefinition.code),
    );

    const result = await eventStreamSelfTest(adapter);

    expect(result.delivered).toBe(true);
    expect(result.message).toBeUndefined();
  });

  it('reports failure with a message when the backend is unreachable', async () => {
    // Real eventstream-redis adapter at a closed port — exercises the readiness fast-fail path, no
    // mocks. retryStrategy gives up after the first refused connection so no timer outlives the test.
    const config = createPluginConfigReaderFrom(
      createEnvReader({
        PLUGIN_EVENTSTREAM_REDIS_URL: 'redis://127.0.0.1:1',
        PLUGIN_EVENTSTREAM_REDIS_CONNECT_TIMEOUT_MS: '200',
      }),
      'eventstream-redis',
    );
    const { adapter, client } = buildRedisEventStreamAdapter(config);
    client.options.retryStrategy = () => null;

    const result = await eventStreamSelfTest(adapter);

    expect(result.delivered).toBe(false);
    expect(result.message).toBeTruthy();
  });
});
