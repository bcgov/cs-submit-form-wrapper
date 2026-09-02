import type { ListPage } from './list';

export interface SubmissionListItem {
  id: string;
  formId: string;
  formName?: string;
  formVersionId: string;
  versionNo?: number;
  workflowState: string;
  engineSyncStatus: string;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  submittedBy?: string | null;
}

export interface ListSubmissionsResponse {
  items: SubmissionListItem[];
  page: ListPage;
  filters: {
    formId?: string;
    formVersionId?: string;
    workflowState?: string;
    createdBy?: string;
    q?: string;
  };
  sort: string;
}

export interface SubmissionResponse {
  id: string;
  formId: string;
  formVersionId: string;
  workflowState: string;
  engineSyncStatus: string;
  currentRevisionNo: number;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  submittedBy?: string | null;
}
