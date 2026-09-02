import express from 'express';
import { coreErrorHandler } from '../../middleware/errorHandler';
import { validateRequest } from '../shared/validation';
import { requireFeature } from '../../middleware/requireFeature';
import { Features } from '../../db/codes';
import {
  addSobaAdminHandler,
  getFeatureScopeHandler,
  listFeatureScopesHandler,
  listDocumentGenerationAuditsHandler,
  listSobaAdminsHandler,
  removeFeatureScopeHandler,
  removeSobaAdminHandler,
  upsertFeatureScopeHandler,
} from './controller';
import {
  AddSobaAdminBodySchema,
  FeatureScopeIdParamsSchema,
  ListFeatureScopesQuerySchema,
  ListDocumentGenerationAuditsQuerySchema,
  ListSobaAdminsQuerySchema,
  SobaAdminUserIdParamsSchema,
  UpsertFeatureScopeBodySchema,
} from './schema';

const router = express.Router();

router.get(
  '/soba-admins',
  validateRequest({ query: ListSobaAdminsQuerySchema }),
  listSobaAdminsHandler,
);
router.post('/soba-admins', validateRequest({ body: AddSobaAdminBodySchema }), addSobaAdminHandler);
router.delete(
  '/soba-admins/:userId',
  validateRequest({ params: SobaAdminUserIdParamsSchema }),
  removeSobaAdminHandler,
);
router.get(
  '/feature-scopes',
  validateRequest({ query: ListFeatureScopesQuerySchema }),
  listFeatureScopesHandler,
);
router.get(
  '/feature-scopes/:featureScopeId',
  validateRequest({ params: FeatureScopeIdParamsSchema }),
  getFeatureScopeHandler,
);
router.delete(
  '/feature-scopes/:featureScopeId',
  validateRequest({ params: FeatureScopeIdParamsSchema }),
  removeFeatureScopeHandler,
);
router.post(
  '/feature-scopes',
  validateRequest({ body: UpsertFeatureScopeBodySchema }),
  upsertFeatureScopeHandler,
);
router.get(
  '/document-generation/audits',
  requireFeature(Features.document_generation),
  validateRequest({ query: ListDocumentGenerationAuditsQuerySchema }),
  listDocumentGenerationAuditsHandler,
);

router.use(coreErrorHandler);

export { router as adminRouter };
