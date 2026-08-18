import { env } from './core/config/env';
env.loadEnv();

import express from 'express';
import rTracer from 'cls-rtracer';
import cors from 'cors';
import passport from 'passport';
import { checkJwt } from './core/middleware/auth';
import { designRouter, submitRouter, coreRouter } from './core/api';
import {
  healthRouter,
  logStartupHealth,
  logTempStorageSelfTest,
  logVirusScanSelfTest,
  logDocumentGenerationReadiness,
} from './core/api/health';
import { metaRouter } from './core/api/meta';
import { buildOpenApiSpec } from './core/api/shared/openapi';
import swaggerUi from 'swagger-ui-express';
import { httpLogger, log } from './core/logging';
import { resolveActor, resolveActorOrPublic } from './core/middleware/actor';
import { requireFeature } from './core/middleware/requireFeature';
import { requireSobaAdmin } from './core/middleware/requireSobaAdmin';
import { adminRouter } from './core/api/admin';
import { globalRateLimit, apiRateLimit, publicRateLimit } from './core/middleware/rateLimit';
import { initializePassport } from './core/auth/passport';
import { Features } from './core/db/codes';

const app = express();
const port = Number(process.env.PORT) || 4000;

// Trust X-Forwarded-* from a bounded number of proxies (not `true` — breaks express-rate-limit IP keys)
app.set('trust proxy', env.getTrustProxySetting());

initializePassport();

// The browser can only read the echoed workspace header if it's explicitly exposed.
const corsExposedHeaders = [];
// CORS is always restricted to an explicit allowlist of trusted origins (never `*`).
// Production origins come from CORS_ORIGIN; in development we fall back to CORS_DEV_ORIGIN
// (configurable per developer via .env) when CORS_ORIGIN is unset.
const configuredOrigins = env.getCorsOrigins() ?? [];
let allowedOrigins = configuredOrigins;
if (allowedOrigins.length === 0 && env.isDevelopment()) {
  allowedOrigins = env.getCorsDevOrigins() ?? [];
}

if (allowedOrigins.length > 0) {
  log.info({ origins: allowedOrigins }, 'Allowing CORS for configured origins');
  app.use(
    cors({
      origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
      credentials: true,
      exposedHeaders: corsExposedHeaders,
    }),
  );
} else {
  log.info('No CORS origins configured; cross-origin requests will be blocked');
}

app.use(
  rTracer.expressMiddleware({
    useHeader: true,
    headerName: 'X-Request-Id',
    echoHeader: true,
  }),
);

app.use(httpLogger);
app.use(passport.initialize());

app.use(globalRateLimit);

// ——— Public routes (no authentication) ———
app.get('/api/docs/openapi.json', publicRateLimit, (_req, res) => {
  res.json(buildOpenApiSpec());
});
app.use(
  '/api/docs',
  publicRateLimit,
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerOptions: {
      url: '/api/docs/openapi.json',
    },
  }),
);

// ——— v1 API ———
// Each surface has its own base path, so its middleware only runs for its own routes (no fall-through,
// no double rate-limit) and its auth stack is uniform.
app.use('/api/v1/meta', publicRateLimit, express.json(), metaRouter);
app.use('/api/v1/health', publicRateLimit, healthRouter);

// Body limit for the body-carrying surfaces — larger than express's 100kb default so document
// generation can carry a base64 template inline (see env.getJsonBodyLimit). meta stays at the
// default: it is public and body-less.
const jsonBodyLimit = env.getJsonBodyLimit();

// Submit feature (public-capable): anonymous resolves to the public user; the Form submitters audience
// decides access. 404s when submit-mode is disabled.
app.use(
  '/api/v1/submit',
  apiRateLimit,
  express.json({ limit: jsonBodyLimit }),
  checkJwt({ allowPublic: true }),
  resolveActorOrPublic,
  requireFeature(Features.submit_mode),
  submitRouter,
);

// Design feature (staff): mandatory auth. 404s when design-mode is disabled.
app.use(
  '/api/v1/design',
  apiRateLimit,
  express.json({ limit: jsonBodyLimit }),
  checkJwt(),
  resolveActor,
  requireFeature(Features.design_mode),
  designRouter,
);

// Admin: platform administration.
app.use(
  '/api/v1/admin',
  apiRateLimit,
  express.json({ limit: jsonBodyLimit }),
  checkJwt(),
  resolveActor,
  requireSobaAdmin,
  adminRouter,
);

// Core: workspace/account management (mandatory auth). Mounted last so the more specific paths win.
app.use(
  '/api/v1',
  apiRateLimit,
  express.json({ limit: jsonBodyLimit }),
  checkJwt(),
  resolveActor,
  coreRouter,
);

app.listen(port, () => {
  log.info({ port }, 'Express is listening');
  void logStartupHealth()
    .then(logTempStorageSelfTest)
    .then(logVirusScanSelfTest)
    .then(logDocumentGenerationReadiness);
});
