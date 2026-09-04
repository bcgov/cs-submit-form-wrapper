import {
  FormVersionListSort,
  appendFormVersionRevision,
  createEmptyFormVersionDraft,
  getFormVersionById,
  getFormVersionByIdIncludingDeleted,
  getPublishedVersionForForm,
  listFormVersionsForWorkspace,
  updateFormVersionDraft,
} from '../db/repos/formVersionRepo';
import { getFormById, getFormEngineCodeForForm } from '../db/repos/formRepo';
import { createFormEngineAdapter } from '../integrations/form-engine/FormEngineRegistry';
import { db } from '../db/client';
import { NotFoundError, ValidationError } from '../errors';

const FORM_VERSION_NOT_FOUND = 'Form version not found';

interface CreateDraftInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  formId: string;
}

interface SaveInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  formVersionId: string;
  eventType: string;
  note?: string;
  formioFormDefinition?: Record<string, unknown>;
  engineSchemaRef?: string | null;
}

interface VersionActionInput {
  workspaceId: string;
  actorId: string;
  actorDisplayLabel: string | null;
  formVersionId: string;
}

interface ListInput {
  workspaceIds: string[];
  actorId: string;
  offset: number;
  limit: number;
  formId?: string;
  formVersionId?: string;
  state?: string;
  sort: FormVersionListSort;
}

type LifecycleState = 'draft' | 'published' | 'archived' | 'deleted';

const ALLOWED_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  draft: ['published', 'deleted'],
  published: ['archived', 'deleted'],
  archived: ['published', 'deleted'],
  deleted: ['draft'],
};

/** Throws if a form version may not move from `from` to `to`. */
function assertTransition(from: string, to: LifecycleState): void {
  const allowed = ALLOWED_TRANSITIONS[from as LifecycleState] ?? [];
  if (!allowed.includes(to)) {
    throw new ValidationError(`Cannot change form version state from '${from}' to '${to}'`);
  }
}

/**
 * Stamp patch for a target state: sets the matching timestamp/actor columns and nulls the rest,
 * so the stamps always match `state` (only `published` has publishedAt/By, only `deleted` has deletedAt/By).
 */
function stateStamps(
  to: LifecycleState,
  actor: { actorId: string; actorDisplayLabel: string | null },
): {
  state: LifecycleState;
  publishedAt: Date | null;
  publishedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
} {
  const patch = {
    state: to,
    publishedAt: null as Date | null,
    publishedBy: null as string | null,
    deletedAt: null as Date | null,
    deletedBy: null as string | null,
  };
  if (to === 'published') {
    patch.publishedAt = new Date();
    patch.publishedBy = actor.actorId;
  } else if (to === 'deleted') {
    patch.deletedAt = new Date();
    patch.deletedBy = actor.actorDisplayLabel;
  }
  return patch;
}

export class FormVersionService {
  async createDraft(input: CreateDraftInput) {
    return createEmptyFormVersionDraft(input);
  }

  async save(input: SaveInput) {
    const updated = await db.transaction(async (tx) => {
      const revised = await appendFormVersionRevision(
        {
          workspaceId: input.workspaceId,
          formVersionId: input.formVersionId,
          actorId: input.actorId,
          actorDisplayLabel: input.actorDisplayLabel,
          eventType: input.eventType,
          changeNote: input.note,
          engineSchemaRef: input.engineSchemaRef || null,
        },
        tx,
      );
      if (!revised) return null;
      // Persist engineSchemaRef into the main formVersion row if supplied.
      // A ref means the Form.io document exists, so the version is in sync ('ready').
      if (input.engineSchemaRef != null) {
        await updateFormVersionDraft(
          input.workspaceId,
          input.formVersionId,
          input.actorDisplayLabel,
          { engineSchemaRef: input.engineSchemaRef, engineSyncStatus: 'ready' },
          tx,
        );
      }

      return revised;
    });

    if (!updated) throw new NotFoundError(FORM_VERSION_NOT_FOUND);

    return updated;
  }

  async delete(input: VersionActionInput) {
    const version = await getFormVersionByIdIncludingDeleted(
      input.workspaceId,
      input.formVersionId,
    );
    if (!version) throw new NotFoundError(FORM_VERSION_NOT_FOUND);
    assertTransition(version.state, 'deleted');
    return updateFormVersionDraft(
      input.workspaceId,
      input.formVersionId,
      input.actorDisplayLabel,
      stateStamps('deleted', input),
    );
  }

  async publish(input: VersionActionInput) {
    const version = await getFormVersionById(input.workspaceId, input.formVersionId);
    if (!version) throw new NotFoundError(FORM_VERSION_NOT_FOUND);
    if (version.state === 'published') return version; // idempotent
    assertTransition(version.state, 'published');
    if (version.engineSyncStatus !== 'ready') {
      throw new ValidationError('Form version is not ready to publish');
    }
    return db.transaction(async (tx) => {
      const current = await getPublishedVersionForForm(input.workspaceId, version.formId, tx);
      if (current && current.id !== version.id) {
        await updateFormVersionDraft(
          input.workspaceId,
          current.id,
          input.actorDisplayLabel,
          stateStamps('archived', input),
          tx,
        );
      }
      return updateFormVersionDraft(
        input.workspaceId,
        input.formVersionId,
        input.actorDisplayLabel,
        stateStamps('published', input),
        tx,
      );
    });
  }

  async unpublish(input: VersionActionInput) {
    const version = await getFormVersionById(input.workspaceId, input.formVersionId);
    if (!version) throw new NotFoundError(FORM_VERSION_NOT_FOUND);
    assertTransition(version.state, 'archived');
    return updateFormVersionDraft(
      input.workspaceId,
      input.formVersionId,
      input.actorDisplayLabel,
      stateStamps('archived', input),
    );
  }

  async restore(input: VersionActionInput) {
    const version = await getFormVersionByIdIncludingDeleted(
      input.workspaceId,
      input.formVersionId,
    );
    if (!version) throw new NotFoundError(FORM_VERSION_NOT_FOUND);
    assertTransition(version.state, 'draft');
    return updateFormVersionDraft(
      input.workspaceId,
      input.formVersionId,
      input.actorDisplayLabel,
      stateStamps('draft', input),
    );
  }

  /**
   * Provision (create-or-update) the form version's schema in the form engine, server-side via the
   * admin client. Sets engineSyncStatus 'provisioning' → 'ready' (with engineSchemaRef) or 'error'.
   */
  async provision(input: {
    workspaceId: string;
    actorId: string;
    actorDisplayLabel: string | null;
    formVersionId: string;
    schema: Record<string, unknown>;
  }) {
    const version = await getFormVersionById(input.workspaceId, input.formVersionId);
    if (!version) throw new NotFoundError(FORM_VERSION_NOT_FOUND);

    const engineCode = await getFormEngineCodeForForm(input.workspaceId, version.formId);
    if (!engineCode) {
      throw new ValidationError('Form has no form engine configured');
    }

    const form = await getFormById(input.workspaceId, version.formId);
    const adapter = createFormEngineAdapter(engineCode);
    if (typeof adapter.upsertSchema !== 'function') {
      throw new ValidationError(`Form engine '${engineCode}' does not support schema provisioning`);
    }

    await updateFormVersionDraft(input.workspaceId, input.formVersionId, input.actorDisplayLabel, {
      engineSyncStatus: 'provisioning',
      engineSyncError: null,
    });

    try {
      const { engineRef } = await adapter.upsertSchema({
        formVersionId: input.formVersionId,
        workspaceId: input.workspaceId,
        schema: input.schema,
        title: form?.name,
      });
      return updateFormVersionDraft(
        input.workspaceId,
        input.formVersionId,
        input.actorDisplayLabel,
        { engineSchemaRef: engineRef, engineSyncStatus: 'ready', engineSyncError: null },
      );
    } catch (err) {
      await updateFormVersionDraft(
        input.workspaceId,
        input.formVersionId,
        input.actorDisplayLabel,
        {
          engineSyncStatus: 'error',
          engineSyncError: err instanceof Error ? err.message : String(err),
        },
      );
      throw err;
    }
  }

  /** Reads the form version's schema back from the form engine (null if unprovisioned). */
  async getSchema(input: { workspaceId: string; formVersionId: string }) {
    const version = await getFormVersionById(input.workspaceId, input.formVersionId);
    if (!version) return null;
    return this.getSchemaForVersion(version);
  }

  /** As getSchema, but for an already-loaded version row — skips the re-fetch by id. */
  async getSchemaForVersion(version: {
    workspaceId: string;
    formId: string;
    engineSchemaRef: string | null;
  }) {
    if (!version.engineSchemaRef) return null;

    const engineCode = await getFormEngineCodeForForm(version.workspaceId, version.formId);
    if (!engineCode) return null;

    const adapter = createFormEngineAdapter(engineCode);
    if (typeof adapter.readSchema !== 'function') return null;

    return adapter.readSchema(version.engineSchemaRef);
  }

  async get(workspaceId: string, formVersionId: string) {
    return getFormVersionById(workspaceId, formVersionId);
  }

  async list(input: ListInput) {
    return listFormVersionsForWorkspace(input);
  }
}
