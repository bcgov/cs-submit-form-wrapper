import { Request, Response } from 'express';
import { pool } from '../../db/client';
import { checkFormEngineReadiness } from '../../integrations/form-engine/FormEngineRegistry';
import { checkDocumentGenerationReadiness } from '../../integrations/document-generation/DocumentGenerationRegistry';
import {
  checkStorageReadiness,
  getCacheAdapter,
  getMessageBusAdapter,
  getEventStreamAdapter,
  getTempStorageAdapter,
  getVirusScanAdapter,
} from '../../integrations/plugins/PluginRegistry';

interface Readiness {
  ok: boolean;
  message?: string;
}

/** Resolve a non-gating readiness report, turning any throw/rejection into { ok: false }. An
 *  undefined result (adapter with no readinessCheck) counts as reachable. */
async function reportReadiness(
  check: () => Promise<Readiness | undefined> | Readiness | undefined,
): Promise<Readiness> {
  try {
    return (await check()) ?? { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function readinessHandler(_req: Request, res: Response): Promise<void> {
  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    dbOk = true;
  } catch {
    // dbOk stays false
  }

  const formEngines = await checkFormEngineReadiness();
  const allEnginesOk = Object.values(formEngines).every((r) => r.ok);

  // Everything below is reported but non-gating — an outage degrades a feature (uploads, rendering,
  // caching, cross-pod fan-out), it doesn't pull the pod from rotation the way DB or a form engine
  // does. Adapters without a readinessCheck (e.g. cache-memory, messagebus-memory) report reachable.
  const storage = await checkStorageReadiness();
  const documentGeneration = await checkDocumentGenerationReadiness();
  const tempStorage = await reportReadiness(async () => ({
    ok: await getTempStorageAdapter().ping(),
  }));
  const virusScanner = await reportReadiness(async () => ({
    ok: await getVirusScanAdapter().ping(),
  }));
  const cache = await reportReadiness(() => getCacheAdapter().readinessCheck?.());
  const messageBus = await reportReadiness(() => getMessageBusAdapter().readinessCheck?.());
  const eventStream = await reportReadiness(() => getEventStreamAdapter().readinessCheck?.());

  const body = {
    status: dbOk && allEnginesOk ? 'ready' : 'unhealthy',
    db: dbOk ? 'ok' : 'unreachable',
    formEngines,
    storage,
    tempStorage,
    virusScanner,
    documentGeneration,
    cache,
    messageBus,
    eventStream,
  };

  if (!dbOk || !allEnginesOk) {
    res.status(503).json(body);
    return;
  }
  res.status(200).json(body);
}
