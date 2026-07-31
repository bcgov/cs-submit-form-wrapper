import type { WorkspaceItem } from '@/src/types/workspaces';
import { RxJsonSchema } from 'rxdb';

export type WorkspaceDocument = WorkspaceItem & { serverSynced?: boolean };

export const workspaceSchema: RxJsonSchema<WorkspaceDocument> = {
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'uuid', // Enforces UUID format
      maxLength: 36, // RxDB requires maxLength on primary keys
    },
    name: { type: 'string', maxLength: 255 },
    kind: { type: 'string' },
    role: { type: 'string' },
    status: { type: 'string' },
    disclaimerAccepted: { type: 'boolean' },
    updatedAt: { type: 'string', format: 'date-time', maxLength: 30 },
    serverSynced: { type: 'boolean' },
  },
  required: ['id', 'name', 'kind', 'role', 'status', 'disclaimerAccepted', 'updatedAt'],
  indexes: ['name', 'updatedAt'],
};
