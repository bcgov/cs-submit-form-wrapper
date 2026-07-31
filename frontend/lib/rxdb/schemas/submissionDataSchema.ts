import { RxJsonSchema } from 'rxdb';

export interface SubmissionDataDocument {
  id: string;
  data: Record<string, unknown>;
  updatedAt: string;
  isDraft: boolean;
  serverSynced?: boolean;
}

export const submissionDataSchema: RxJsonSchema<SubmissionDataDocument> = {
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid',
      maxLength: 36,
    },
    data: {
      type: 'object',
    },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 30 },
    isDraft: { type: 'boolean' },
    serverSynced: { type: 'boolean' },
  },
  required: ['id', 'data', 'updatedAt', 'isDraft'],
};
