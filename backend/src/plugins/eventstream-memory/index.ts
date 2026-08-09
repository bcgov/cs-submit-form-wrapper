import type {
  EventStreamAdapter,
  EventStreamPluginDefinition,
  EventStreamSubscription,
} from '../../core/integrations/eventstream/EventStreamAdapter';
import type { PluginConfigReader } from '../../core/config/pluginConfig';
import { log } from '../../core/logging';

const DEFAULT_MAX_DELIVERIES = 5;
const IDLE_POLL_MS = 50;

interface StoredMessage {
  id: string;
  payload: Record<string, unknown>;
}

/**
 * In-process event stream for single-replica/local use. Approximates the durable-log + consumer-group
 * + at-least-once semantics well enough to wire features locally: append-ordered delivery, ack on
 * handler success, redelivery on throw (up to maxDeliveries, then dropped with a warning), and
 * replay from the beginning for a new group. It is NOT durable — the log lives in memory, a process
 * restart loses it, and it does not model cross-replica or competing-consumer split within a group
 * (each consume() is an independent reader). Use eventstream-redis for real guarantees.
 */
function createInMemoryEventStreamAdapter(config: PluginConfigReader): EventStreamAdapter {
  void config; // required by the interface; this plugin takes no config
  const streams = new Map<string, StoredMessage[]>();
  const waiters = new Map<string, Array<() => void>>();
  let seq = 0;

  const streamOf = (name: string): StoredMessage[] => {
    const existing = streams.get(name);
    if (existing) return existing;
    const created: StoredMessage[] = [];
    streams.set(name, created);
    return created;
  };

  const wake = (name: string): void => {
    const list = waiters.get(name);
    if (!list?.length) return;
    waiters.set(name, []);
    for (const resolve of list) resolve();
  };

  const waitForAppend = (name: string): Promise<void> =>
    new Promise((resolve) => {
      const list = waiters.get(name) ?? [];
      list.push(resolve);
      waiters.set(name, list);
    });

  return {
    async append(stream: string, payload: Record<string, unknown>): Promise<{ id: string }> {
      const id = String(++seq);
      streamOf(stream).push({ id, payload });
      wake(stream);
      return { id };
    },

    consume(stream, group, consumer, handler, options): Promise<EventStreamSubscription> {
      void consumer; // identity is not modelled in memory
      const maxDeliveries = options?.maxDeliveries ?? DEFAULT_MAX_DELIVERIES;
      const messages = streamOf(stream);
      let cursor = options?.from === 'beginning' ? 0 : messages.length;
      const redeliver: Array<{ message: StoredMessage; attempt: number }> = [];
      let stopped = false;

      const deliver = async (message: StoredMessage, attempt: number): Promise<void> => {
        try {
          await handler({ id: message.id, payload: message.payload, attempt });
        } catch (err) {
          if (attempt >= maxDeliveries) {
            log.warn(
              { err, stream, group, id: message.id, attempt },
              '[eventstream-memory] message exceeded maxDeliveries, dropping',
            );
          } else {
            redeliver.push({ message, attempt: attempt + 1 });
          }
        }
      };

      const loop = async (): Promise<void> => {
        while (!stopped) {
          const pending = redeliver.shift();
          if (pending) {
            await deliver(pending.message, pending.attempt);
          } else if (cursor < messages.length) {
            await deliver(messages[cursor++], 1);
          } else {
            await Promise.race([
              waitForAppend(stream),
              new Promise<void>((resolve) => setTimeout(resolve, IDLE_POLL_MS)),
            ]);
          }
        }
      };

      void loop();

      return Promise.resolve(async () => {
        stopped = true;
        wake(stream); // unblock the idle wait so the loop can exit
      });
    },
  };
}

export const eventStreamPluginDefinition: EventStreamPluginDefinition = {
  code: 'eventstream-memory',
  createAdapter: createInMemoryEventStreamAdapter,
};
