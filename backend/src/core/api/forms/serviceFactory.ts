import { FormService } from '../../services/formService';
import { FormVersionService } from '../../services/formVersionService';
import { resolveFormPermissions } from '../../db/repos/formAccessRepo';
import { decodeCursorAndMode, buildNextCursor, type CursorSort } from '../shared/pagination';

export interface FormsContextInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
}

/** Scope for list/search: single workspace resolved from a scope anchor. */
export interface FormsListScopeInput {
  workspaceIds: string[];
  actorId: string;
}

interface ListFormsQueryInput {
  workspaceId?: string;
  formId?: string;
  limit: number;
  cursor?: string;
  q?: string;
  status?: string;
  sort?: CursorSort;
}

interface ListFormVersionsQueryInput {
  workspaceId?: string;
  formId?: string;
  formVersionId?: string;
  limit: number;
  cursor?: string;
  state?: string;
  sort?: CursorSort;
}

interface CreateFormInput {
  name: string;
  description?: string;
  formEngineCode?: string;
}

interface UpdateFormInput {
  name?: string;
  description?: string | null;
  status?: string;
}

const toFormDto = (item: {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}) => ({
  id: item.id,
  workspaceId: item.workspaceId,
  name: item.name,
  description: item.description,
  status: item.status,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  createdBy: item.createdBy,
  updatedBy: item.updatedBy,
});

const toFormListItemDto = (item: {
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}) => ({
  id: item.id,
  workspaceId: item.workspaceId,
  name: item.name,
  status: item.status,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  createdBy: item.createdBy,
  updatedBy: item.updatedBy,
});

const toFormVersionDto = (item: {
  id: string;
  formId: string;
  versionNo: number;
  state: string;
  engineSyncStatus: string;
  engineSchemaRef: string | null;
  currentRevisionNo: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}) => ({
  id: item.id,
  formId: item.formId,
  versionNo: item.versionNo,
  state: item.state,
  engineSyncStatus: item.engineSyncStatus,
  engineSchemaRef: item.engineSchemaRef,
  currentRevisionNo: item.currentRevisionNo,
  publishedAt: item.publishedAt?.toISOString() ?? null,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  createdBy: item.createdBy,
  updatedBy: item.updatedBy,
});

const toFormVersionListItemDto = (item: {
  id: string;
  formId: string;
  versionNo: number;
  state: string;
  engineSyncStatus: string;
  engineSchemaRef: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}) => ({
  id: item.id,
  formId: item.formId,
  versionNo: item.versionNo,
  state: item.state,
  engineSyncStatus: item.engineSyncStatus,
  engineSchemaRef: item.engineSchemaRef,
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString(),
  createdBy: item.createdBy,
  updatedBy: item.updatedBy,
});

export function createFormsApiService(
  formService: FormService,
  formVersionService: FormVersionService,
) {
  return {
    createForm: async (ctx: FormsContextInput, input: CreateFormInput) => {
      const { form, version } = await formService.create({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        actorDisplayLabel: ctx.actorDisplayLabel,
        name: input.name,
        description: input.description,
        formEngineCode: input.formEngineCode,
      });
      return { ...toFormDto(form), formVersion: toFormVersionDto(version) };
    },

    normalizeSchema: (_ctx: FormsContextInput, schema: Record<string, unknown>) =>
      formService.normalizeSchema(schema),

    updateForm: async (ctx: FormsContextInput, formId: string, input: UpdateFormInput) => {
      const row = await formService.update({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        actorDisplayLabel: ctx.actorDisplayLabel,
        formId,
        name: input.name,
        description: input.description,
        status: input.status,
      });
      return row ? toFormDto(row) : null;
    },

    getForm: async (ctx: FormsContextInput, formId: string) => {
      const row = await formService.get(ctx.workspaceId, formId);
      if (!row) return null;
      // Caller's permissions on this form, so the UI can gate actions. Workspace-scoped today.
      const permissions = await resolveFormPermissions(ctx.actorId, ctx.workspaceId);
      return {
        ...toFormDto(row),
        permissions: [...permissions].sort((a, b) => a.localeCompare(b)),
      };
    },

    list: async (scope: FormsListScopeInput, query: ListFormsQueryInput) => {
      const { cursorMode, sort, afterId, afterUpdatedAt } = decodeCursorAndMode({
        cursor: query.cursor,
        sort: query.sort,
      });
      const result = await formService.list({
        workspaceIds: scope.workspaceIds,
        actorId: scope.actorId,
        limit: query.limit,
        formId: query.formId,
        q: query.q,
        status: query.status,
        sort,
        cursorMode,
        afterId,
        afterUpdatedAt,
      });

      const lastItem = result.items[result.items.length - 1];
      const nextCursor = buildNextCursor(lastItem, result.hasMore, cursorMode);

      return {
        items: result.items.map((item) => toFormListItemDto(item)),
        page: {
          limit: query.limit,
          hasMore: result.hasMore,
          nextCursor,
          cursorMode,
        },
        filters: {
          workspaceId: query.workspaceId,
          formId: query.formId,
          q: query.q,
          status: query.status,
        },
        sort,
      };
    },

    getFormVersion: async (ctx: FormsContextInput, formVersionId: string) => {
      const row = await formVersionService.get(ctx.workspaceId, formVersionId);
      return row ? toFormVersionDto(row) : null;
    },

    listFormVersions: async (scope: FormsListScopeInput, query: ListFormVersionsQueryInput) => {
      const { cursorMode, sort, afterId, afterUpdatedAt } = decodeCursorAndMode({
        cursor: query.cursor,
        sort: query.sort,
      });
      const result = await formVersionService.list({
        workspaceIds: scope.workspaceIds,
        actorId: scope.actorId,
        limit: query.limit,
        formId: query.formId,
        formVersionId: query.formVersionId,
        state: query.state,
        sort,
        cursorMode,
        afterId,
        afterUpdatedAt,
      });

      const lastItem = result.items[result.items.length - 1];
      const nextCursor = buildNextCursor(lastItem, result.hasMore, cursorMode);

      return {
        items: result.items.map((item) => toFormVersionListItemDto(item)),
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
          state: query.state,
        },
        sort,
      };
    },

    createDraft: async (ctx: FormsContextInput, formId: string) =>
      toFormVersionDto(
        await formVersionService.createDraft({
          workspaceId: ctx.workspaceId,
          actorId: ctx.actorId,
          actorDisplayLabel: ctx.actorDisplayLabel,
          formId,
        }),
      ),

    save: (
      ctx: FormsContextInput,
      formVersionId: string,
      input: {
        eventType?: string;
        note?: string;
        formioFormDefinition?: Record<string, unknown>;
        engine_schema_ref?: string;
      },
    ) =>
      formVersionService
        .save({
          workspaceId: ctx.workspaceId,
          actorId: ctx.actorId,
          actorDisplayLabel: ctx.actorDisplayLabel,
          formVersionId,
          eventType: input.eventType || 'save_draft',
          note: input.note,
          formioFormDefinition: input.formioFormDefinition,
          engineSchemaRef: input.engine_schema_ref || null,
        })
        .then((row) => toFormVersionDto(row)),

    delete: (ctx: FormsContextInput, formVersionId: string) =>
      formVersionService.delete({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        actorDisplayLabel: ctx.actorDisplayLabel,
        formVersionId,
      }),

    publish: async (ctx: FormsContextInput, formVersionId: string) => {
      const row = await formVersionService.publish({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        actorDisplayLabel: ctx.actorDisplayLabel,
        formVersionId,
      });
      return row ? toFormVersionDto(row) : null;
    },

    unpublish: async (ctx: FormsContextInput, formVersionId: string) => {
      const row = await formVersionService.unpublish({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        actorDisplayLabel: ctx.actorDisplayLabel,
        formVersionId,
      });
      return row ? toFormVersionDto(row) : null;
    },

    restore: async (ctx: FormsContextInput, formVersionId: string) => {
      const row = await formVersionService.restore({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        actorDisplayLabel: ctx.actorDisplayLabel,
        formVersionId,
      });
      return row ? toFormVersionDto(row) : null;
    },

    provision: async (
      ctx: FormsContextInput,
      formVersionId: string,
      schema: Record<string, unknown>,
    ) => {
      const row = await formVersionService.provision({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        actorDisplayLabel: ctx.actorDisplayLabel,
        formVersionId,
        schema,
      });
      return row ? toFormVersionDto(row) : null;
    },

    getSchema: (ctx: FormsContextInput, formVersionId: string) =>
      formVersionService.getSchema({ workspaceId: ctx.workspaceId, formVersionId }),

    deleteForm: (ctx: FormsContextInput, formId: string) =>
      formService.delete({
        workspaceId: ctx.workspaceId,
        actorId: ctx.actorId,
        actorDisplayLabel: ctx.actorDisplayLabel,
        formId,
      }),
  };
}

export type FormsApiService = ReturnType<typeof createFormsApiService>;
