import { pool } from '../../db/client';
import { log } from '../../logging';
import {
  getCacheAdapter,
  getMessageBusAdapter,
  getEventStreamAdapter,
  getTempStorageAdapter,
  getVirusScanAdapter,
  resolveActivePluginCode,
} from '../../integrations/plugins/PluginRegistry';
import {
  tempStorageSelfTest,
  type TempStorageSelfTestResult,
} from '../../integrations/temp-storage/tempStorageSelfTest';
import {
  virusScanSelfTest,
  type VirusScanSelfTestResult,
} from '../../integrations/virus-scan/virusScanSelfTest';
import { cacheSelfTest, type CacheSelfTestResult } from '../../integrations/cache/cacheSelfTest';
import {
  messageBusSelfTest,
  type MessageBusSelfTestResult,
} from '../../integrations/messagebus/messageBusSelfTest';
import {
  eventStreamSelfTest,
  type EventStreamSelfTestResult,
} from '../../integrations/eventstream/eventStreamSelfTest';
import { checkDocumentGenerationReadiness } from '../../integrations/document-generation/DocumentGenerationRegistry';

/** Run a check; swallow sync throws and rejections. */
async function probe(check: () => Promise<boolean>): Promise<boolean> {
  try {
    return await check();
  } catch {
    return false;
  }
}

/** Log a one-shot up/down ping of db, temp storage, virus scanner and cache at startup. Log-only;
 *  never throws. Deeper per-service checks run separately below. */
export async function logStartupHealth(): Promise<void> {
  const [db, tempStorage, virusScanner, cache, messageBus, eventStream] = await Promise.all([
    probe(() => pool.query('SELECT 1').then(() => true)),
    probe(() => getTempStorageAdapter().ping()),
    probe(() => getVirusScanAdapter().ping()),
    // No readinessCheck (e.g. cache-memory) means nothing to reach — reported reachable.
    probe(
      () =>
        getCacheAdapter()
          .readinessCheck?.()
          .then((r) => r.ok) ?? Promise.resolve(true),
    ),
    // Likewise messagebus-memory has no readinessCheck — reported reachable.
    probe(
      () =>
        getMessageBusAdapter()
          .readinessCheck?.()
          .then((r) => r.ok) ?? Promise.resolve(true),
    ),
    // eventstream-memory has no readinessCheck — reported reachable.
    probe(
      () =>
        getEventStreamAdapter()
          .readinessCheck?.()
          .then((r) => r.ok) ?? Promise.resolve(true),
    ),
  ]);

  const health = { db, tempStorage, virusScanner, cache, messageBus, eventStream };
  const unreachable = Object.entries(health)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  if (unreachable.length > 0) {
    log.warn({ health }, `Startup health: unreachable: ${unreachable.join(', ')}`);
  } else {
    log.info({ health }, 'Startup health: all dependencies reachable');
  }
}

/** Log the temp-storage self-test (write + read back + remove), including backend
 *  and path. Failed round-trip logs WARN. Never throws. */
export async function logTempStorageSelfTest(): Promise<void> {
  let result: TempStorageSelfTestResult;
  try {
    result = await tempStorageSelfTest(getTempStorageAdapter());
  } catch (err) {
    log.warn({ err }, 'Temp storage self-test could not run');
    return;
  }

  const tempStorage = {
    code: resolveActivePluginCode('tempStorage'),
    path: result.path,
    roundTrip: result.roundTrip,
  };

  if (result.roundTrip) {
    log.info({ tempStorage }, 'Temp storage self-test: read/write OK');
  } else {
    log.warn({ tempStorage, message: result.message }, 'Temp storage self-test: read/write failed');
  }
}

/** Log the virus-scan self-test (ping + EICAR scan). The noop scanner reports clean by
 *  design, so it logs INFO; a real scanner that can't detect EICAR (unreachable or missing
 *  definitions) logs WARN, since uploads fail closed against it. Never throws. */
export async function logVirusScanSelfTest(): Promise<void> {
  let result: VirusScanSelfTestResult;
  try {
    result = await virusScanSelfTest(getVirusScanAdapter());
  } catch (err) {
    log.warn({ err }, 'Virus scan self-test could not run');
    return;
  }

  const virusScan = {
    code: result.scannerCode,
    connected: result.connected,
    verdict: result.verdict,
    healthy: result.healthy,
  };

  if (result.healthy) {
    log.info({ virusScan }, 'Virus scan self-test: scanner detecting (definitions loaded)');
  } else if (result.scannerCode === 'virusscan-noop') {
    log.info({ virusScan }, 'Virus scan self-test: scanning disabled (noop)');
  } else {
    log.warn(
      { virusScan, message: result.message },
      'Virus scan self-test: configured scanner not detecting (unreachable or definitions missing)',
    );
  }
}

/** Log the cache self-test (write + read back + remove), including the active backend. A failed
 *  round-trip logs WARN; the app still runs (lookups fall through to the source). Never throws. */
export async function logCacheSelfTest(): Promise<void> {
  let result: CacheSelfTestResult;
  try {
    result = await cacheSelfTest(getCacheAdapter());
  } catch (err) {
    log.warn({ err }, 'Cache self-test could not run');
    return;
  }

  const cache = {
    code: resolveActivePluginCode('cache'),
    roundTrip: result.roundTrip,
  };

  if (result.roundTrip) {
    log.info({ cache }, 'Cache self-test: read/write OK');
  } else {
    log.warn({ cache, message: result.message }, 'Cache self-test: read/write failed');
  }
}

/** Log the message-bus self-test (publish + receive back on a throwaway topic), including the active
 *  backend. A failed round-trip logs WARN; the app still runs (cross-pod fan-out degrades, it isn't
 *  an outage). Never throws. */
export async function logMessageBusSelfTest(): Promise<void> {
  let result: MessageBusSelfTestResult;
  try {
    result = await messageBusSelfTest(getMessageBusAdapter());
  } catch (err) {
    log.warn({ err }, 'Message bus self-test could not run');
    return;
  }

  const messageBus = {
    code: resolveActivePluginCode('messagebus'),
    delivered: result.delivered,
  };

  if (result.delivered) {
    log.info({ messageBus }, 'Message bus self-test: pub/sub delivery OK');
  } else {
    log.warn(
      { messageBus, message: result.message },
      'Message bus self-test: pub/sub delivery failed',
    );
  }
}

/** Log the event-stream self-test (append + consume back on a throwaway stream), including the active
 *  backend. A failed round-trip logs WARN; the app still runs (async processing degrades, it isn't an
 *  outage). Never throws. */
export async function logEventStreamSelfTest(): Promise<void> {
  let result: EventStreamSelfTestResult;
  try {
    result = await eventStreamSelfTest(getEventStreamAdapter());
  } catch (err) {
    log.warn({ err }, 'Event stream self-test could not run');
    return;
  }

  const eventStream = {
    code: resolveActivePluginCode('eventStream'),
    delivered: result.delivered,
  };

  if (result.delivered) {
    log.info({ eventStream }, 'Event stream self-test: append/consume delivery OK');
  } else {
    log.warn(
      { eventStream, message: result.message },
      'Event stream self-test: append/consume delivery failed',
    );
  }
}

/** Log per-backend document-generation readiness (CDOGS liveness / config) at startup. Never throws. */
export async function logDocumentGenerationReadiness(): Promise<void> {
  let results: Record<string, { ok: boolean; message?: string }>;
  try {
    results = await checkDocumentGenerationReadiness();
  } catch (err) {
    log.warn({ err }, 'Document generation readiness could not run');
    return;
  }

  const notReady = Object.entries(results)
    .filter(([, r]) => !r.ok)
    .map(([code]) => code);

  if (notReady.length > 0) {
    log.warn(
      { documentGeneration: results },
      `Document generation readiness: not ready: ${notReady.join(', ')}`,
    );
  } else {
    log.info({ documentGeneration: results }, 'Document generation readiness: all backends ready');
  }
}
