import { createPluginConfigReader } from '../../../src/core/config/pluginConfig';
import { eventStreamPluginDefinition } from '../../../src/plugins/eventstream-memory';
import type {
  EventStreamAdapter,
  EventStreamMessage,
} from '../../../src/core/integrations/eventstream/EventStreamAdapter';

// Real in-process adapter, no mocks. Delivery runs on an async loop, so tests await a signal the
// handler resolves rather than assuming synchronous delivery.
function adapter(): EventStreamAdapter {
  return eventStreamPluginDefinition.createAdapter(
    createPluginConfigReader(eventStreamPluginDefinition.code),
  );
}

/** A handler plus a promise that resolves once it has been invoked `count` times. */
function collector(count = 1) {
  const seen: EventStreamMessage[] = [];
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  const handler = async (message: EventStreamMessage): Promise<void> => {
    seen.push(message);
    if (seen.length >= count) resolve();
  };
  return { seen, done, handler };
}

const flush = (ms = 80): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('eventstream-memory', () => {
  it('has the expected code', () => {
    expect(eventStreamPluginDefinition.code).toBe('eventstream-memory');
  });

  it('replays appended events in order for a group started at the beginning', async () => {
    const bus = adapter();
    await bus.append('orders', { n: 1 });
    await bus.append('orders', { n: 2 });

    const { seen, done, handler } = collector(2);
    const stop = await bus.consume('orders', 'g1', 'c1', handler, { from: 'beginning' });
    await done;
    await stop();

    expect(seen.map((m) => m.payload)).toEqual([{ n: 1 }, { n: 2 }]);
    expect(seen.every((m) => m.attempt === 1)).toBe(true);
  });

  it("default 'new' start skips events appended before the group joined", async () => {
    const bus = adapter();
    await bus.append('orders', { n: 'old' });

    const { seen, done, handler } = collector(1);
    const stop = await bus.consume('orders', 'g1', 'c1', handler);
    await bus.append('orders', { n: 'new' });
    await done;
    await stop();

    expect(seen.map((m) => m.payload)).toEqual([{ n: 'new' }]);
  });

  it('redelivers on handler throw until it succeeds, incrementing attempt', async () => {
    const bus = adapter();
    await bus.append('orders', { n: 1 });

    const attempts: number[] = [];
    let resolve!: () => void;
    const done = new Promise<void>((r) => (resolve = r));
    const handler = async (m: EventStreamMessage): Promise<void> => {
      attempts.push(m.attempt);
      if (m.attempt < 2) throw new Error('transient');
      resolve();
    };

    const stop = await bus.consume('orders', 'g1', 'c1', handler, { from: 'beginning' });
    await done;
    await stop();

    expect(attempts).toEqual([1, 2]);
  });

  it('drops a poison message after maxDeliveries', async () => {
    const bus = adapter();
    await bus.append('orders', { n: 1 });

    const attempts: number[] = [];
    const handler = async (m: EventStreamMessage): Promise<void> => {
      attempts.push(m.attempt);
      throw new Error('always fails');
    };

    const stop = await bus.consume('orders', 'g1', 'c1', handler, {
      from: 'beginning',
      maxDeliveries: 3,
    });
    await flush();
    await stop();

    expect(attempts).toEqual([1, 2, 3]); // no 4th delivery after the limit
  });

  it('stops delivering after the subscription is stopped', async () => {
    const bus = adapter();
    const { seen, handler } = collector();
    const stop = await bus.consume('orders', 'g1', 'c1', handler);

    await stop();
    await bus.append('orders', { n: 1 });
    await flush();

    expect(seen).toEqual([]);
  });
});
