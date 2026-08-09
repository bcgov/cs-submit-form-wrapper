/**
 * Pluggable event-stream capability: a durable, replayable log with consumer groups and
 * at-least-once delivery. Distinct from the message bus (MessageBusAdapter), which is at-most-once
 * fire-and-forget pub/sub. Implementations are provided by plugins (eventstream-memory,
 * eventstream-redis) and selected via EVENTSTREAM_DEFAULT_CODE.
 *
 * The contract is deliberately the common denominator of Redis Streams and NATS JetStream so
 * neither leaks: append + a handler-driven consume loop that acks on success and redelivers on
 * throw. Transport primitives (XREADGROUP/XACK/XAUTOCLAIM vs pull/ack) stay inside the plugin.
 */
import type { PluginConfigReader } from '../../config/pluginConfig';

/** Result of an event-stream readiness check; exposes no config or credentials. */
export interface EventStreamReadinessResult {
  ok: boolean;
  message?: string;
}

export interface EventStreamMessage {
  /** Backend id/sequence (Redis XADD id, JetStream seq). Opaque; used for ordering and replay. */
  id: string;
  payload: Record<string, unknown>;
  /** 1-based delivery attempt; > 1 means redelivered (Redis PEL delivery count / NATS num_delivered). */
  attempt: number;
}

export interface EventStreamConsumeOptions {
  /** New-group start position: 'new' (only messages after the group is created; default) or
   *  'beginning' (replay the whole stream). Ignored for a group that already exists. */
  from?: 'beginning' | 'new';
  /** Redeliver a failing message at most this many times, then dead-letter/drop it (guards against a
   *  poison message looping forever). Defaults to the plugin's own limit. */
  maxDeliveries?: number;
}

export type EventStreamHandler = (message: EventStreamMessage) => Promise<void>;

/** Leave the consumer group and release the underlying connection. */
export type EventStreamSubscription = () => Promise<void>;

export interface EventStreamAdapter {
  /**
   * Append an event to a stream; resolves with its id. Throws on failure — delivery is at-least-once,
   * so the caller decides how to handle a failed append (a transactional outbox can wrap this later
   * for guaranteed delivery across a backend outage).
   */
  append(stream: string, payload: Record<string, unknown>): Promise<{ id: string }>;

  /**
   * Join `group` as `consumer` and process `stream`: the handler resolving acks the message, the
   * handler throwing redelivers it (at-least-once — handlers MUST be idempotent). Runs the
   * read → process → ack/claim loop internally and resolves with a subscription that stops it.
   */
  consume(
    stream: string,
    group: string,
    consumer: string,
    handler: EventStreamHandler,
    options?: EventStreamConsumeOptions,
  ): Promise<EventStreamSubscription>;

  /** Optional: report whether the backend is reachable (readiness). No config in the result. */
  readinessCheck?(): Promise<EventStreamReadinessResult>;
}

export interface EventStreamPluginDefinition {
  code: string;
  createAdapter: (config: PluginConfigReader) => EventStreamAdapter;
}
