import { SubmissionDataDocument } from '../schemas/submissionDataSchema';
import { SubmissionDocument } from '../schemas/submissionSchema';
import { WorkspaceDocument } from '../schemas/workspaceSchema';

export function submission_1(oldDoc: SubmissionDocument) {
  // Add serverSynced
  return {
    ...oldDoc,
    serverSynced: true,
  };
}

export function submissionData_1(oldDoc: SubmissionDataDocument) {
  // Add serverSynced
  return {
    ...oldDoc,
    serverSynced: false,
  };
}

export function workspace_1(oldDoc: WorkspaceDocument) {
  // Add serverSynced
  return {
    ...oldDoc,
    serverSynced: false,
  };
}
