import { SubmissionService } from '../../services/submissionService';
import { decodeCursorAndMode, buildNextCursor, type CursorSort } from '../shared/pagination';
import type {
  SubmissionRecord,
  SubmissionListRow,
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
  limit: number;
  cursor?: string;
  workflowState?: string;
  createdBy?: string;
  sort?: CursorSort;
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
      const { cursorMode, sort, afterId, afterUpdatedAt } = decodeCursorAndMode({
        cursor: query.cursor,
        sort: query.sort,
      });
      const result = await submissionService.list({
        workspaceIds: scope.workspaceIds,
        actorId: scope.actorId,
        limit: query.limit,
        formId: query.formId,
        formVersionId: query.formVersionId,
        submissionId: query.submissionId,
        workflowState: query.workflowState,
        createdBy: query.createdBy,
        sort,
        cursorMode,
        afterId,
        afterUpdatedAt,
      });

      const lastItem = result.items[result.items.length - 1];
      const nextCursor = buildNextCursor(lastItem, result.hasMore, cursorMode);

      return {
        items: result.items.map((item) => toSubmissionListItemDto(item)),
        page: {
          limit: query.limit,
          hasMore: result.hasMore,
          nextCursor,
          cursorMode,
        },
        filters: {
          workspaceId: query.workspaceId,
          formId: query.formId,
          formVersionId: query.formVersionId,
          submissionId: query.submissionId,
          workflowState: query.workflowState,
          createdBy: query.createdBy,
        },
        sort,
      };
    },

    open: async (ctx: SubmissionsContextInput, formId: string) =>
      toSubmissionDto(await submissionService.open({ ...ctx, formId })),

    save: (ctx: SubmissionsContextInput, submissionId: string, data: Record<string, unknown>) =>
      submissionService.save({ ...ctx, submissionId, data }).then((row) => toSubmissionDto(row)),

    submit: (ctx: SubmissionsContextInput, submissionId: string, data: Record<string, unknown>) =>
      submissionService.submit({ ...ctx, submissionId, data }).then((row) => toSubmissionDto(row)),

    delete: (ctx: SubmissionsContextInput, submissionId: string) =>
      submissionService.delete({ ...ctx, submissionId }),
  };
}

export type SubmissionsApiService = ReturnType<typeof createSubmissionsApiService>;
