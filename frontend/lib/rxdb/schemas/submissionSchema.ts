import type { SubmissionListItem } from '@/src/types/submissions';
import { RxJsonSchema } from 'rxdb';

export type SubmissionDocument = SubmissionListItem & { serverSynced?: boolean };

export const submissionSchema: RxJsonSchema<SubmissionDocument> = {
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid', // Enforces UUID format
      maxLength: 36, // RxDB requires maxLength on primary keys
    },
    formId: { type: 'string', maxLength: 36 },
    formName: { type: 'string', maxLength: 255 },
    formVersionId: { type: 'string', maxLength: 36 },
    versionNo: { type: 'number' },
    workflowState: { type: 'string' },
    engineSyncStatus: { type: 'string' },
    submittedAt: { type: ['string', 'null'], format: 'date-time', maxLength: 30 },
    createdAt: { type: 'string', format: 'date-time', maxLength: 30 },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 30 },
    serverSynced: { type: 'boolean' },
  },
  required: ['id', 'formId', 'formVersionId', 'submittedAt', 'createdAt', 'updatedAt'],
  indexes: ['formId', 'createdAt'],
};
