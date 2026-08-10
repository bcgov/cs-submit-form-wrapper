import type Redis from 'ioredis';
import { createEnvReader } from '../../../src/core/config/env';
import { createPluginConfigReaderFrom } from '../../../src/core/config/pluginConfig';
import {
  buildRedisEventStreamAdapter,
  eventStreamPluginDefinition,
  extractEntries,
  parseEnvelope,
} from '../../../src/plugins/eventstream-redis';

// Points the adapter at a closed local port so connections are refused fast. No mocks: this
// exercises the real fail-loud path — unlike the at-most-once message bus, event-stream append and
// consume MUST surface an outage (at-least-once), not swallow it. retryStrategy gives up after the
// first failure so no reconnect timer outlives the test.
function unreachableAdapter(): {
  adapter: ReturnType<typeof buildRedisEventStreamAdapter>['adapter'];
  client: Redis;
} {
  const source = {
    PLUGIN_EVENTSTREAM_REDIS_URL: 'redis://127.0.0.1:1',
    PLUGIN_EVENTSTREAM_REDIS_CONNECT_TIMEOUT_MS: '200',
  };
  const config = createPluginConfigReaderFrom(createEnvReader(source), 'eventstream-redis');
  const built = buildRedisEventStreamAdapter(config);
  built.client.options.retryStrategy = () => null;
  return built;
}

describe('eventstream-redis definition', () => {
  it('has the expected code', () => {
    expect(eventStreamPluginDefinition.code).toBe('eventstream-redis');
  });
});

describe('extractEntries (XREADGROUP reply parsing)', () => {
  const entries = [
    ['1-0', ['data', '{"e":1}']],
    ['2-0', ['data', '{"e":2}']],
  ];

  it('handles the RESP3 flattened shape [name, entries]', () => {
    expect(extractEntries(['orders', entries])).toEqual(entries);
  });

  it('handles multiple streams under RESP3 [n1, e1, n2, e2]', () => {
    expect(extractEntries(['a', [entries[0]], 'b', [entries[1]]])).toEqual(entries);
  });

  it('handles the RESP2 nested shape [[name, entries]]', () => {
    expect(extractEntries([['orders', entries]])).toEqual(entries);
  });

  it('returns [] for null or empty replies (BLOCK timeout)', () => {
    expect(extractEntries(null)).toEqual([]);
    expect(extractEntries([])).toEqual([]);
  });
});

describe('parseEnvelope', () => {
  it('parses the JSON envelope from the data field', () => {
    expect(parseEnvelope(['data', '{"type":"order","data":{"e":1}}'])).toEqual({
      type: 'order',
      data: { e: 1 },
      id: undefined,
      time: undefined,
    });
  });

  it('returns an unknown envelope when the data field is absent or malformed', () => {
    expect(parseEnvelope(['other', 'x'])).toEqual({ type: 'unknown', data: {} });
    expect(parseEnvelope(['data', 'not-json'])).toEqual({ type: 'unknown', data: {} });
  });
});

describe('eventstream-redis (backend unreachable)', () => {
  let adapter: ReturnType<typeof unreachableAdapter>['adapter'];

  beforeEach(() => {
    // retryStrategy is overridden (in unreachableAdapter) to give up on the first refused connect, so
    // the client ends itself — no disconnect() in teardown, which would arm ioredis's 2s
    // disconnectTimeout and linger as an open handle past Jest's exit window.
    ({ adapter } = unreachableAdapter());
  });

  it('append rejects (fail-loud) rather than dropping when the backend is down', async () => {
    await expect(adapter.append('orders', { type: 'order', data: { n: 1 } })).rejects.toThrow();
  });

  it('consume rejects when the group cannot be created (backend down)', async () => {
    await expect(adapter.consume('orders', 'g1', 'c1', async () => undefined)).rejects.toThrow();
  });

  it('readinessCheck reports not-ok with a message', async () => {
    const result = await adapter.readinessCheck!();
    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });
});
