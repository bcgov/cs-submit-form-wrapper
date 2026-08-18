import { createPluginConfigReader } from '../../../src/core/config/pluginConfig';
import { messagebusPluginDefinition } from '../../../src/plugins/messagebus-memory';
import type { MessageBusAdapter } from '../../../src/core/integrations/messagebus/MessageBusAdapter';

// Real in-process adapter, no mocks. Delivery is fire-and-forget on the next tick, so tests await a
// signal the handler resolves rather than assuming synchronous delivery.
function adapter(): MessageBusAdapter {
  return messagebusPluginDefinition.createAdapter(
    createPluginConfigReader(messagebusPluginDefinition.code),
  );
}

/** A handler plus a promise that resolves once it has been invoked `count` times. */
function collector(count = 1) {
  const received: Array<Record<string, unknown>> = [];
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const handler = async (payload: Record<string, unknown>): Promise<void> => {
    received.push(payload);
    if (received.length >= count) resolve();
  };
  return { received, done, handler };
}

/** Resolve after pending microtasks + one macrotask, so "did NOT deliver" can be asserted. */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

describe('messagebus-memory', () => {
  it('has the expected code', () => {
    expect(messagebusPluginDefinition.code).toBe('messagebus-memory');
  });

  it('delivers a published payload to a subscriber', async () => {
    const bus = adapter();
    const { received, done, handler } = collector();
    bus.subscribe!('submission.saved', handler);

    await bus.publish('submission.saved', { id: 'abc' });
    await done;

    expect(received).toEqual([{ id: 'abc' }]);
  });

  it('delivers to every subscriber on the topic', async () => {
    const bus = adapter();
    const a = collector();
    const b = collector();
    bus.subscribe!('t', a.handler);
    bus.subscribe!('t', b.handler);

    await bus.publish('t', { n: 1 });
    await Promise.all([a.done, b.done]);

    expect(a.received).toEqual([{ n: 1 }]);
    expect(b.received).toEqual([{ n: 1 }]);
  });

  it('supports subscribing to multiple topics with one handler', async () => {
    const bus = adapter();
    const { received, done, handler } = collector(2);
    bus.subscribe!(['a', 'b'], handler);

    await bus.publish('a', { from: 'a' });
    await bus.publish('b', { from: 'b' });
    await done;

    expect(received).toEqual(expect.arrayContaining([{ from: 'a' }, { from: 'b' }]));
    expect(received).toHaveLength(2);
  });

  it('stops delivering after unsubscribe', async () => {
    const bus = adapter();
    const { received, handler } = collector();
    const unsubscribe = bus.subscribe!('t', handler);

    (unsubscribe as () => void)();
    await bus.publish('t', { n: 1 });
    await flush();

    expect(received).toEqual([]);
  });

  it('isolates a throwing handler from the others', async () => {
    const bus = adapter();
    const throwing = async (): Promise<void> => {
      throw new Error('boom');
    };
    const { received, done, handler } = collector();
    bus.subscribe!('t', throwing);
    bus.subscribe!('t', handler);

    await bus.publish('t', { n: 1 });
    await done;

    expect(received).toEqual([{ n: 1 }]);
  });

  it('publish with no subscribers resolves without throwing', async () => {
    const bus = adapter();
    await expect(bus.publish('nobody', { n: 1 })).resolves.toBeUndefined();
  });
});
