import { Request, Response } from 'express';
import { pool } from '../../db/client';
import { checkFormEngineReadiness } from '../../integrations/form-engine/FormEngineRegistry';
import { checkDocumentGenerationReadiness } from '../../integrations/document-generation/DocumentGenerationRegistry';
import {
  checkStorageReadiness,
  getCacheAdapter,
  getTempStorageAdapter,
  getVirusScanAdapter,
} from '../../integrations/plugins/PluginRegistry';

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

  // Storage readiness is reported but non-gating — a storage outage degrades uploads, it doesn't
  // pull the pod from rotation (unlike DB and form engines).
  const storage = await checkStorageReadiness();

  // Temp storage is likewise reported but non-gating.
  let tempStorage: { ok: boolean; message?: string };
  try {
    tempStorage = { ok: await getTempStorageAdapter().ping() };
  } catch (err) {
    tempStorage = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  // Virus scanner is reported but non-gating — a scanner outage blocks uploads (fail-closed at the
  // upload path), it doesn't pull the pod from rotation.
  let virusScanner: { ok: boolean; message?: string };
  try {
    virusScanner = { ok: await getVirusScanAdapter().ping() };
  } catch (err) {
    virusScanner = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  // Document generation is reported but non-gating — a CDOGS outage degrades rendering, it doesn't
  // pull the pod from rotation.
  const documentGeneration = await checkDocumentGenerationReadiness();

  // Cache is reported but non-gating — a cache outage falls through to Postgres (slower, not an
  // outage). An adapter without a readinessCheck (e.g. cache-memory) is reported ok.
  let cache: { ok: boolean; message?: string };
  try {
    cache = (await getCacheAdapter().readinessCheck?.()) ?? { ok: true };
  } catch (err) {
    cache = { ok: false, message: err instanceof Error ? err.message : String(err) };
  }

  const body = {
    status: dbOk && allEnginesOk ? 'ready' : 'unhealthy',
    db: dbOk ? 'ok' : 'unreachable',
    formEngines,
    storage,
    tempStorage,
    virusScanner,
    documentGeneration,
    cache,
  };

  if (!dbOk || !allEnginesOk) {
    res.status(503).json(body);
    return;
  }
  res.status(200).json(body);
}
