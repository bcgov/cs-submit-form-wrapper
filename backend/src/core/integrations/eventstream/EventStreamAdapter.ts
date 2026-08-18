/**
 * Pluggable event-stream capability: a durable, replayable log with consumer groups and
 * at-least-once delivery. Distinct from the message bus (MessageBusAdapter), which is at-most-once
 * fire-and-forget pub/sub. Implementations are provided by plugins (eventstream-memory,
 * eventstream-redis) and selected via EVENTSTREAM_DEFAULT_CODE.
 *
 * The contract is deliberately the common denominator of Redis Streams and NATS JetStream so
 * neither leaks: provision a stream (retention), append typed events, and consume via a
 * handler-driven loop that acks on success and redelivers on throw. Transport primitives
 * (XREADGROUP/XACK/XAUTOCLAIM vs pull/ack) stay inside the plugin.
 */
import type { PluginConfigReader } from '../../config/pluginConfig';

/** Result of an event-stream readiness check; exposes no config or credentials. */
export interface EventStreamReadinessResult {
  ok: boolean;
  message?: string;
}

/**
 * Stream-level retention. On JetStream this maps to stream creation (max_msgs/max_age); on Redis
 * Streams it is applied as trimming. Retention and at-least-once are in tension — trimming can drop
 * un-acked entries if a consumer lags past the limit — so there is no default cap; a stream is
 * unbounded until a limit is set deliberately.
 *
 * Not passed per call: limits are declared in streamRetention.ts and resolved identically on every
 * replica, because a Redis-side trim is only consistent if every appending pod computes the same cap.
 */
export interface EventStreamConfig {
  /** Approximate max retained entries (Redis XADD MAXLEN ~ N; JetStream max_msgs). */
  maxLen?: number;
  /** Age-based retention in ms (Redis periodic XTRIM MINID; JetStream max_age). */
  maxAgeMs?: number;
}

/** A typed event on the log. `type` discriminates payloads for replay; `data` is JSON-plain. */
export interface EventEnvelope {
  type: string;
  data: Record<string, unknown>;
  /** Optional producer-supplied id for dedup/correlation (distinct from the stream entry id). */
  id?: string;
  /** ISO timestamp; the adapter fills it at append if the producer omits it. */
  time?: string;
}

export interface EventStreamMessage {
  /** Backend entry id/sequence (Redis XADD id, JetStream seq). Opaque; used for ordering and replay. */
  id: string;
  /** 1-based delivery attempt; > 1 means redelivered (Redis PEL delivery count / NATS num_delivered). */
  attempt: number;
  event: EventEnvelope;
}

export interface EventStreamConsumeOptions {
  /** New-group start position: 'new' (only events after the group is created; default) or
   *  'beginning' (replay the whole stream). Set at group creation; ignored once the group exists. */
  from?: 'beginning' | 'new';
  /** Redeliver a failing event at most this many times, then dead-letter it (guards a poison event
   *  from looping forever). Consumer-group creation-time (maps to JetStream max_deliver). */
  maxDeliveries?: number;
}

export type EventStreamHandler = (message: EventStreamMessage) => Promise<void>;

/** Stop consuming and release the underlying connection. Un-acked in-flight events stay pending
 *  and remain claimable by other consumers in the group — they are not lost or dropped. */
export type EventStreamSubscription = () => Promise<void>;

export interface EventStreamAdapter {
  /**
   * Provision a stream. Portable, and required for JetStream (which cannot auto-create); Redis
   * auto-creates on first append, so it is a no-op there. Retention is not an argument — it comes
   * from the shared declarations in streamRetention.ts, so a stream is capped the same way whether
   * or not the appending replica is the one that provisioned it. Idempotent.
   */
  ensureStream(stream: string): Promise<void>;

  /**
   * Append a typed event; resolves with its entry id. Throws on failure — delivery is at-least-once,
   * so the caller decides how to handle a failed append (a transactional outbox can wrap this later
   * for guaranteed delivery across an outage).
   */
  append(stream: string, event: EventEnvelope): Promise<{ id: string }>;

  /**
   * Join `group` as `consumer` and process `stream`: the handler resolving acks the event, the
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

  /** Optional: delete a stream and its consumer groups. Portable lifecycle op (Redis DEL / JetStream
   *  delete); used to clean up throwaway streams (e.g. the startup self-test). */
  deleteStream?(stream: string): Promise<void>;
}

export interface EventStreamPluginDefinition {
  code: string;
  createAdapter: (config: PluginConfigReader) => EventStreamAdapter;
}
