import { SubmissionService } from '../../services/submissionService';
import type {
  SubmissionRecord,
  SubmissionListRow,
  SubmissionListSort,
  SubmissionDetailRow,
} from '../../db/repos/submissionRepo';

export interface SubmissionsContextInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
}

/** Scope for list/search: single workspace resolved from a scope anchor. */
export interface SubmissionsListScopeInput {
  workspaceIds: string[];
  actorId: string;
}

interface ListSubmissionsQueryInput {
  workspaceId?: string;
  formId?: string;
  formVersionId?: string;
  submissionId?: string;
  offset: number;
  limit: number;
  workflowState?: string;
  createdBy?: string;
  q?: string;
  sort: SubmissionListSort;
}

const toSubmissionDto = (item: SubmissionRecord | SubmissionDetailRow) => {
  const detail = item as Partial<SubmissionDetailRow>;
  return {
    id: item.id,
    formId: item.formId,
    formName: detail.form?.name ?? 'Untitled Form',
    formVersionId: item.formVersionId,
    versionNo: detail.formVersion?.versionNo ?? item.currentRevisionNo ?? 1,
    workflowState: item.workflowState,
    engineSyncStatus: item.engineSyncStatus,
    currentRevisionNo: item.currentRevisionNo,
    submittedAt: item.submittedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    createdBy: detail.createdBy ?? null,
    submittedBy: detail.submittedBy ?? null,
  };
};

const toSubmissionListItemDto = (item: SubmissionListRow) => ({
  id: item.id,
  formId: item.formId,
  formName: item.form.name ?? 'Untitled Form',
  formVersionId: item.formVersionId,
  versionNo: item.formVersion.versionNo ?? 1,
  workflowState: item.workflowState,
  engineSyncStatus: item.engineSyncStatus,
  submittedAt: item.submittedAt?.toISOString() ?? null,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  createdBy: item.createdBy,
  submittedBy: item.submittedBy,
});

export function createSubmissionsApiService(submissionService: SubmissionService) {
  return {
    get: async (ctx: SubmissionsContextInput, submissionId: string) => {
      const row = await submissionService.get(ctx.workspaceId, submissionId);
      return row ? toSubmissionDto(row) : null;
    },

    getData: (ctx: SubmissionsContextInput, submissionId: string) =>
      submissionService.getContent({ workspaceId: ctx.workspaceId, submissionId }),

    list: async (scope: SubmissionsListScopeInput, query: ListSubmissionsQueryInput) => {
      const result = await submissionService.list({
        workspaceIds: scope.workspaceIds,
        actorId: scope.actorId,
        offset: query.offset,
        limit: query.limit,
        formId: query.formId,
        formVersionId: query.formVersionId,
        submissionId: query.submissionId,
        workflowState: query.workflowState,
        createdBy: query.createdBy,
        q: query.q,
        sort: query.sort,
      });

      return {
        items: result.items.map((item) => toSubmissionListItemDto(item)),
        page: {
          offset: query.offset,
          limit: query.limit,
          total: result.total,
        },
        filters: {
          workspaceId: query.workspaceId,
          formId: query.formId,
          formVersionId: query.formVersionId,
          submissionId: query.submissionId,
          workflowState: query.workflowState,
          createdBy: query.createdBy,
          q: query.q,
        },
        sort: query.sort,
      };
    },

    open: async (ctx: SubmissionsContextInput, formId: string, id: string) => {
      const { created, record } = await submissionService.open({ ...ctx, formId, id });
      return { created, submission: toSubmissionDto(record) };
    },

    save: (ctx: SubmissionsContextInput, submissionId: string, data: Record<string, unknown>) =>
      submissionService.save({ ...ctx, submissionId, data }).then((row) => toSubmissionDto(row)),

    submit: (ctx: SubmissionsContextInput, submissionId: string, data: Record<string, unknown>) =>
      submissionService.submit({ ...ctx, submissionId, data }).then((row) => toSubmissionDto(row)),

    delete: (ctx: SubmissionsContextInput, submissionId: string) =>
      submissionService.delete({ ...ctx, submissionId }),
  };
}

export type SubmissionsApiService = ReturnType<typeof createSubmissionsApiService>;
