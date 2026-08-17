import express from 'express';
import { validateRequest } from '../shared/validation';
import { requireFeature } from '../../middleware/requireFeature';
import { Features } from '../../db/codes';
import {
  addSobaAdminHandler,
  listDocumentGenerationAuditsHandler,
  listSobaAdminsHandler,
  removeSobaAdminHandler,
  upsertFeatureScopeHandler,
} from './controller';
import {
  AddSobaAdminBodySchema,
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

export { router as adminRouter };
