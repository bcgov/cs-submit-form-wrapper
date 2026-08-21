import express from 'express';
import { validateRequest } from '../shared/validation';
import {
  workspaceFromBody,
  workspaceListScope,
  workspaceFromResource,
} from '../../middleware/workspaceContext';
import { requireFormPermissions } from '../../middleware/requireFormPermissions';
import { Permissions } from '../../db/codes';
import {
  createForm,
  normalizeFormSchema,
  createFormVersion,
  updateForm,
  getForm,
  getFormVersion,
  listForms,
  listFormVersions,
  deleteForm,
  deleteFormVersion,
  saveFormVersion,
  publishFormVersion,
  unpublishFormVersion,
  restoreFormVersion,
  provisionFormVersionSchema,
  getFormVersionSchema,
} from './controller';
import {
  CreateFormBodySchema,
  CreateFormVersionBodySchema,
  FormIdParamsSchema,
  FormVersionIdParamsSchema,
  NormalizeSchemaBodySchema,
  ListFormsQuerySchema,
  ListFormVersionsQuerySchema,
  ProvisionSchemaBodySchema,
  SaveFormVersionBodySchema,
  SaveFormVersionParamsSchema,
  UpdateFormBodySchema,
} from './schema';

// Design-mode form authoring: mounted under /api/v1/design with mandatory auth. Every route is
// staff-only — membership is resolved strictly and gated by form permissions (no audience logic;
// that lives in the submit feature).
const router = express.Router();

const FORMS_PATH = '/forms';
const FORMS_ID_PATH = `${FORMS_PATH}/:id`;
const FORM_VERSIONS_PATH = '/form-versions';
const FORM_VERSIONS_ID_PATH = `${FORM_VERSIONS_PATH}/:id`;

const formResource = workspaceFromResource({ kind: 'form', idFrom: 'paramsId' });
const formVersionResource = workspaceFromResource({ kind: 'formVersion', idFrom: 'paramsId' });
// Creating a version resolves the workspace from the parent form id in the request body.
const formFromBodyResource = workspaceFromResource({ kind: 'form', idFrom: 'bodyFormId' });

router.get(
  FORMS_PATH,
  validateRequest({ query: ListFormsQuerySchema }),
  workspaceListScope({ anchorOrder: ['formId', 'workspaceId'], allowEmpty: true }),
  requireFormPermissions([Permissions.form_read]),
  listForms,
);
// Membership-only (workspace resolved from the body); the disclaimer gate lives in the service.
router.post(
  FORMS_PATH,
  validateRequest({ body: CreateFormBodySchema }),
  workspaceFromBody,
  createForm,
);
// Schema-shaping utility; actor-only (no workspace context).
router.post(
  `${FORMS_PATH}/normalize`,
  validateRequest({ body: NormalizeSchemaBodySchema }),
  normalizeFormSchema,
);
router.get(
  FORMS_ID_PATH,
  validateRequest({ params: FormIdParamsSchema }),
  formResource,
  requireFormPermissions([Permissions.form_read]),
  getForm,
);
router.patch(
  FORMS_ID_PATH,
  validateRequest({ params: FormIdParamsSchema, body: UpdateFormBodySchema }),
  formResource,
  requireFormPermissions([Permissions.form_update]),
  updateForm,
);
router.get(
  FORM_VERSIONS_PATH,
  validateRequest({ query: ListFormVersionsQuerySchema }),
  workspaceListScope({ anchorOrder: ['formVersionId', 'formId', 'workspaceId'], allowEmpty: true }),
  requireFormPermissions([Permissions.form_read]),
  listFormVersions,
);
router.get(
  FORM_VERSIONS_ID_PATH,
  validateRequest({ params: FormVersionIdParamsSchema }),
  formVersionResource,
  requireFormPermissions([Permissions.form_read]),
  getFormVersion,
);
router.post(
  FORM_VERSIONS_PATH,
  validateRequest({ body: CreateFormVersionBodySchema }),
  formFromBodyResource,
  requireFormPermissions([Permissions.design_create]),
  createFormVersion,
);
router.post(
  `${FORM_VERSIONS_ID_PATH}/save`,
  validateRequest({ params: SaveFormVersionParamsSchema, body: SaveFormVersionBodySchema }),
  formVersionResource,
  requireFormPermissions([Permissions.design_update]),
  saveFormVersion,
);
router.post(
  `${FORM_VERSIONS_ID_PATH}/publish`,
  validateRequest({ params: FormVersionIdParamsSchema }),
  formVersionResource,
  requireFormPermissions([Permissions.design_update]),
  publishFormVersion,
);
router.post(
  `${FORM_VERSIONS_ID_PATH}/unpublish`,
  validateRequest({ params: FormVersionIdParamsSchema }),
  formVersionResource,
  requireFormPermissions([Permissions.design_update]),
  unpublishFormVersion,
);
router.post(
  `${FORM_VERSIONS_ID_PATH}/restore`,
  validateRequest({ params: FormVersionIdParamsSchema }),
  formVersionResource,
  requireFormPermissions([Permissions.design_update]),
  restoreFormVersion,
);
router.get(
  `${FORM_VERSIONS_ID_PATH}/schema`,
  validateRequest({ params: FormVersionIdParamsSchema }),
  formVersionResource,
  requireFormPermissions([Permissions.form_read]),
  getFormVersionSchema,
);
router.post(
  `${FORM_VERSIONS_ID_PATH}/schema`,
  validateRequest({ params: FormVersionIdParamsSchema, body: ProvisionSchemaBodySchema }),
  formVersionResource,
  requireFormPermissions([Permissions.design_update]),
  provisionFormVersionSchema,
);
router.delete(
  FORM_VERSIONS_ID_PATH,
  validateRequest({ params: FormVersionIdParamsSchema }),
  formVersionResource,
  requireFormPermissions([Permissions.design_delete]),
  deleteFormVersion,
);
router.delete(
  FORMS_ID_PATH,
  validateRequest({ params: FormIdParamsSchema }),
  formResource,
  requireFormPermissions([Permissions.form_delete]),
  deleteForm,
);

export { router as designFormsRouter };
