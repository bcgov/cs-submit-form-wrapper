import { v7 as uuidv7 } from 'uuid';
import type { EventStreamAdapter, EventStreamSubscription } from './EventStreamAdapter';

const DEFAULT_TIMEOUT_MS = 4000;

export interface EventStreamSelfTestResult {
  /** Appended an event to a throwaway stream and a consumer received it back. */
  delivered: boolean;
  message?: string;
}

/**
 * Confirm the stream actually delivers, not just that the backend is reachable: consume a unique
 * throwaway stream from the beginning, append a probe, and wait for it to arrive. Checks readiness
 * first so a down backend fails fast. Cleans up the (durable) stream afterwards via deleteStream so
 * repeated startups don't accumulate streams. Never throws; any failure -> delivered: false.
 */
export async function eventStreamSelfTest(
  adapter: EventStreamAdapter,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<EventStreamSelfTestResult> {
  const readiness = (await adapter.readinessCheck?.()) ?? { ok: true };
  if (!readiness.ok) {
    return { delivered: false, message: readiness.message };
  }

  const stream = `__eventstream_selftest__:${uuidv7()}`;
  const probe = uuidv7();
  let received = false;
  let resolveGot!: () => void;
  const got = new Promise<void>((resolve) => (resolveGot = resolve));

  let stop: EventStreamSubscription | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    stop = await adapter.consume(
      stream,
      `selftest-${uuidv7()}`,
      'selftest',
      async (message) => {
        if (message.event.data.probe === probe) {
          received = true;
          resolveGot();
        }
      },
      { from: 'beginning' },
    );
    await adapter.append(stream, { type: 'selftest', data: { probe } });
    // Cancelable timeout: clear it when delivery wins the race, else the orphaned timer keeps the
    // event loop alive for timeoutMs after this resolves.
    await Promise.race([
      got,
      new Promise<void>((resolve) => (timer = setTimeout(resolve, timeoutMs))),
    ]);
    return received
      ? { delivered: true }
      : { delivered: false, message: 'no delivery within timeout' };
  } catch (err) {
    return { delivered: false, message: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer) clearTimeout(timer);
    if (stop) await stop().catch(() => undefined);
    await adapter.deleteStream?.(stream).catch(() => undefined);
  }
}
