import {
  createForm,
  FormRecord,
  FormListSort,
  formNameExistsInWorkspace,
  getFormById,
  listFormsForWorkspace,
  markFormDeleted,
  updateForm,
  getFormByEngineSchemaRef,
} from '../db/repos/formRepo';
import { createEmptyFormVersionDraft } from '../db/repos/formVersionRepo';
import { isWorkspaceDisclaimerAccepted } from '../db/repos/workspaceRepo';
import { db } from '../db/client';
import { env } from '../config/env';
import {
  createFormEngineAdapter,
  getFormEnginePlugins,
  resolveFormEnginePlugin,
} from '../integrations/form-engine/FormEngineRegistry';
import { ConflictError, ValidationError } from '../errors';
import { FORM_NAME_TAKEN } from '../messages';

interface DeleteInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  formId: string;
}

interface ListInput {
  workspaceIds: string[];
  actorId: string;
  offset: number;
  limit: number;
  formId?: string;
  q?: string;
  status?: string;
  sort: FormListSort;
}

interface CreateInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  name: string;
  description?: string;
  formEngineCode?: string;
}

interface UpdateInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  formId: string;
  name?: string;
  description?: string | null;
  status?: string;
}

export class FormService {
  async create(input: CreateInput): Promise<{
    form: FormRecord;
    version: Awaited<ReturnType<typeof createEmptyFormVersionDraft>>;
  }> {
    // Gate: the workspace disclaimer must be accepted before any form can be created.
    if (!(await isWorkspaceDisclaimerAccepted(input.workspaceId))) {
      throw new ConflictError('Accept the workspace disclaimer before creating forms');
    }
    const plugins = getFormEnginePlugins();
    if (plugins.length === 0) {
      throw new ValidationError('No form engine plugins installed.');
    }
    const defaultCode =
      env.getFormEngineDefaultCode() ??
      (plugins.some((p) => p.code === 'formio-v5') ? 'formio-v5' : plugins[0].code);
    const engineCode = input.formEngineCode ?? defaultCode;
    const installed = plugins.some((p) => p.code === engineCode);
    if (!installed) {
      throw new ValidationError(
        input.formEngineCode
          ? `Form engine '${input.formEngineCode}' is not installed`
          : `Default form engine '${defaultCode}' is not installed`,
      );
    }
    resolveFormEnginePlugin(engineCode);

    if (await formNameExistsInWorkspace(input.workspaceId, input.name)) {
      throw new ConflictError(FORM_NAME_TAKEN);
    }

    // One-call create: form + an empty v1 draft in a single transaction.
    return db.transaction(async (tx) => {
      const form = await createForm(
        {
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          actorDisplayLabel: input.actorDisplayLabel,
          name: input.name,
          description: input.description,
          formEngineCode: engineCode,
        },
        tx,
      );
      const version = await createEmptyFormVersionDraft(
        {
          workspaceId: input.workspaceId,
          formId: form.id,
          actorId: input.actorId,
          actorDisplayLabel: input.actorDisplayLabel,
        },
        tx,
      );
      return { form, version };
    });
  }

  async update(input: UpdateInput): Promise<FormRecord | null> {
    if (
      input.name !== undefined &&
      (await formNameExistsInWorkspace(input.workspaceId, input.name, input.formId))
    ) {
      throw new ConflictError(FORM_NAME_TAKEN);
    }
    return updateForm(input);
  }

  /**
   * Normalize a schema (import file or export) into a clean, portable, builder-ready form
   * definition using the default form engine. Returns it unchanged if the engine can't normalize.
   */
  normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
    const plugins = getFormEnginePlugins();
    if (plugins.length === 0) {
      throw new ValidationError('No form engine plugins installed.');
    }
    const defaultCode =
      env.getFormEngineDefaultCode() ??
      (plugins.some((p) => p.code === 'formio-v5') ? 'formio-v5' : plugins[0].code);
    const adapter = createFormEngineAdapter(defaultCode);
    if (typeof adapter.normalizeSchema !== 'function') {
      return schema;
    }
    return adapter.normalizeSchema(schema);
  }

  async get(workspaceId: string, formId: string): Promise<FormRecord | null> {
    return getFormById(workspaceId, formId);
  }

  async getByEngineSchemaRef(
    workspaceId: string,
    engineSchemaRef: string,
  ): Promise<FormRecord | null> {
    return getFormByEngineSchemaRef(workspaceId, engineSchemaRef);
  }

  async list(input: ListInput) {
    return listFormsForWorkspace(input);
  }

  async delete(input: DeleteInput) {
    return markFormDeleted(input.workspaceId, input.formId, input.actorDisplayLabel);
  }
}
