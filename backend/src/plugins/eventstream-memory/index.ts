import type {
  EventEnvelope,
  EventStreamAdapter,
  EventStreamPluginDefinition,
  EventStreamSubscription,
} from '../../core/integrations/eventstream/EventStreamAdapter';
import type { PluginConfigReader } from '../../core/config/pluginConfig';
import { log } from '../../core/logging';

const DEFAULT_MAX_DELIVERIES = 5;

interface StoredMessage {
  id: string;
  event: EventEnvelope;
}

/**
 * In-process event stream for single-replica/local use. Approximates the durable-log + consumer-group
 * + at-least-once semantics well enough to wire features locally: append-ordered delivery, ack on
 * handler success, redelivery on throw (up to maxDeliveries, then dropped with a warning), and
 * replay from the beginning for a new group. It is NOT durable — the log lives in memory, a process
 * restart loses it, it does not model cross-replica or competing-consumer split within a group (each
 * consume() is an independent reader), and it does not enforce retention (ensureStream is a no-op).
 * Use eventstream-redis for real guarantees.
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
    // Memory keeps the full log and enforces no retention; provisioning is a no-op here.
    async ensureStream(): Promise<void> {},

    async append(stream: string, event: EventEnvelope): Promise<{ id: string }> {
      const id = String(++seq);
      streamOf(stream).push({
        id,
        event: { ...event, time: event.time ?? new Date().toISOString() },
      });
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
          await handler({ id: message.id, attempt, event: message.event });
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
            // Block until the next append or a stop() (both call wake). Registration is synchronous,
            // so there's no lost-wakeup window; no polling timer is needed (and it would leak waiters).
            await waitForAppend(stream);
          }
        }
      };

      void loop();

      return Promise.resolve(async () => {
        stopped = true;
        wake(stream); // unblock the idle wait so the loop can exit
      });
    },

    async deleteStream(stream: string): Promise<void> {
      streams.delete(stream);
      waiters.delete(stream);
    },
  };
}

export const eventStreamPluginDefinition: EventStreamPluginDefinition = {
  code: 'eventstream-memory',
  createAdapter: createInMemoryEventStreamAdapter,
};
