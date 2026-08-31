import express from 'express';
import { readinessHandler } from './readyHandler';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

router.get('/ready', readinessHandler);

export const healthRouter = router;
export { registerHealthOpenApi } from './schema';
export {
  logStartupHealth,
  logTempStorageSelfTest,
  logVirusScanSelfTest,
  logCacheSelfTest,
  logMessageBusSelfTest,
  logEventStreamSelfTest,
  logDocumentGenerationReadiness,
} from './startupHealth';
