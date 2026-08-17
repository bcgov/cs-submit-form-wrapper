import type {
  MessageBusAdapter,
  MessageBusPluginDefinition,
} from '../../core/integrations/messagebus/MessageBusAdapter';
import type { PluginConfigReader } from '../../core/config/pluginConfig';
import { log } from '../../core/logging';

type Handler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * In-process pub/sub for single-replica/local use. Delivery mirrors Redis pub/sub semantics: publish
 * fans out fire-and-forget and never awaits or observes handler outcomes, and handlers run on the
 * next tick so one slow or rejecting handler cannot block publish or the others. Fan-out is
 * in-process only — it does not reach other replicas (that is what messagebus-redis is for).
 */
function createInMemoryMessageBusAdapter(config: PluginConfigReader): MessageBusAdapter {
  void config; // required by the interface; this plugin takes no config
  const handlers = new Map<string, Handler[]>();

  const dispatch = (topic: string, payload: Record<string, unknown>): void => {
    const list = handlers.get(topic);
    if (!list?.length) return;
    // Handlers are scheduled, not called, so unsubscribing during delivery cannot disturb this loop.
    for (const handler of list) {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => log.warn({ err, topic }, '[messagebus-memory] subscriber handler failed'));
    }
  };

  return {
    async publish(topic: string, payload: Record<string, unknown>): Promise<void> {
      dispatch(topic, payload);
    },

    subscribe(
      topic: string | string[],
      handler: (payload: Record<string, unknown>) => Promise<void>,
    ): () => void {
      const topics = Array.isArray(topic) ? topic : [topic];
      for (const t of topics) {
        const list = handlers.get(t) ?? [];
        list.push(handler);
        handlers.set(t, list);
      }
      return () => {
        for (const t of topics) {
          const list = handlers.get(t) ?? [];
          const idx = list.indexOf(handler);
          if (idx !== -1) list.splice(idx, 1);
          if (list.length === 0) handlers.delete(t);
          else handlers.set(t, list);
        }
      };
    },
  };
}

export const messagebusPluginDefinition: MessageBusPluginDefinition = {
  code: 'messagebus-memory',
  createAdapter: createInMemoryMessageBusAdapter,
};
