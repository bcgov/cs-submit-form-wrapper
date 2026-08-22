import {
  FormEngineAdapter,
  type CreateSubmissionInput,
  type FormEngineReadinessResult,
  type UpsertSchemaInput,
} from '../../core/integrations/form-engine/FormEngineAdapter';
import { PluginConfigReader } from '../../core/config/pluginConfig';
import { ValidationError } from '../../core/errors';
import { getAuthenticatedFormioClient } from './formioV5Client';
import { normalizeSchema as normalizeFormioSchema } from './normalizeSchema';

export interface FormioV5Config {
  apiBaseUrl: string;
  adminApiUrl: string;
  renderApiUrl: string;
  adminUsername: string;
  adminPassword: string;
  projectPath?: string;
  version?: string;
}

const loadConfig = (config: PluginConfigReader): FormioV5Config => {
  return {
    apiBaseUrl: config.getRequired('API_BASE_URL'),
    adminApiUrl: config.getRequired('ADMIN_API_URL'),
    renderApiUrl: config.getRequired('RENDER_API_URL'),
    adminUsername: config.getRequired('ADMIN_USERNAME'),
    adminPassword: config.getRequired('ADMIN_PASSWORD'),
    projectPath: config.getOptional('PROJECT_PATH'),
    version: config.getOptional('VERSION'),
  };
};

/** Deterministic Form.io identity for a SOBA form version (unique per project; the idempotency key). */
const sobaEngineName = (formVersionId: string): string => `soba-${formVersionId}`;

/** Normalize an existing `tags` value (array or comma-separated string) to trimmed candidate tokens. */
function extractTagCandidates(existing: unknown): string[] {
  if (Array.isArray(existing)) {
    return existing.map((t) => (t == null ? '' : String(t).trim()));
  }
  if (typeof existing === 'string') {
    return existing.split(',').map((part) => part.trim());
  }
  return [];
}

/** Tenancy tags: always include `soba` and the workspace id; preserve any existing tags. */
function mergeSobaWorkspaceTags(existing: unknown, workspaceId: string): string[] {
  const out = new Set<string>(['soba', workspaceId]);
  for (const candidate of extractTagCandidates(existing)) {
    if (candidate) out.add(candidate);
  }
  return [...out];
}

/**
 * Map a Form.io rejection that carries a 4xx status into a ValidationError (HTTP 400), so a
 * malformed/rejected schema surfaces as a client error rather than a 500. Re-throws anything else
 * (network/5xx) unchanged.
 */
function rethrowEngineRejection(err: unknown): never {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? Number((err as { status: unknown }).status)
      : NaN;
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    const message =
      err instanceof Error && err.message ? err.message : 'Form engine rejected the schema';
    throw new ValidationError(`Form engine rejected the schema: ${message}`);
  }
  throw err;
}

/** Form.io-managed identity/audit fields the client must never set (write) or receive (read). */
const ENGINE_MANAGED_FIELDS = ['_id', 'machineName', 'created', 'modified', 'owner', 'project'];

/** Remove engine-managed fields from a schema document (returns a shallow clone). */
export function stripEngineManagedFields(doc: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = { ...doc };
  for (const key of ENGINE_MANAGED_FIELDS) {
    delete cleaned[key];
  }
  return cleaned;
}

/** Build the Form.io form document for an upsert: strip engine-managed fields, then apply
 *  deterministic identity + SOBA tenancy metadata. */
export function buildSchemaBody(input: UpsertSchemaInput): Record<string, unknown> {
  const base = stripEngineManagedFields(
    JSON.parse(JSON.stringify(input.schema ?? {})) as Record<string, unknown>,
  );
  const name = sobaEngineName(input.formVersionId);

  const prevProps =
    typeof base.properties === 'object' &&
    base.properties !== null &&
    !Array.isArray(base.properties)
      ? (base.properties as Record<string, unknown>)
      : {};

  const title =
    (input.title && input.title.trim()) ||
    (typeof base.title === 'string' && base.title.trim()) ||
    'Form';

  return {
    ...base,
    name,
    path: name,
    title,
    properties: {
      ...prevProps,
      soba_workspace_id: input.workspaceId,
      soba_form_version_id: input.formVersionId,
    },
    tags: mergeSobaWorkspaceTags(base.tags, input.workspaceId),
  };
}

/**
 * Form.io strips submission `data` keys that aren't form components, so the correlation key lives in
 * submission `metadata` (preserved intact) as a single STRING field — Form.io can filter metadata by
 * string but not by number, so the deterministic key is a string, not the numeric `soba_revision_no`.
 */
const SOBA_REVISION_KEY_FIELD = 'soba_revision_key';

/** Deterministic per-revision idempotency key for a submission save. */
const sobaSubmissionRevisionKey = (submissionId: string, revisionNo: number): string =>
  `soba-${submissionId}-r${revisionNo}`;

/** Build the Form.io submission document for a create: the answer data plus SOBA correlation/tenancy
 *  metadata (the per-revision key in metadata, queryable for idempotency). */
export function buildSubmissionBody(input: CreateSubmissionInput): Record<string, unknown> {
  const answers =
    typeof input.data === 'object' && input.data !== null && !Array.isArray(input.data)
      ? (JSON.parse(JSON.stringify(input.data)) as Record<string, unknown>)
      : {};
  return {
    data: answers,
    metadata: {
      soba_workspace_id: input.workspaceId,
      soba_submission_id: input.submissionId,
      soba_revision_no: input.revisionNo,
      [SOBA_REVISION_KEY_FIELD]: sobaSubmissionRevisionKey(input.submissionId, input.revisionNo),
    },
  };
}

export class FormioEngineAdapter implements FormEngineAdapter {
  private readonly config: FormioV5Config;
  private readonly pluginConfig: PluginConfigReader;

  constructor(pluginConfig: PluginConfigReader) {
    this.pluginConfig = pluginConfig;
    this.config = loadConfig(pluginConfig);
  }

  async readinessCheck(): Promise<FormEngineReadinessResult> {
    try {
      const url = this.config.renderApiUrl.replace(/\/$/, '') || this.config.renderApiUrl;
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) });
      if (res.ok || res.status === 404) {
        return { ok: true };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Idempotent create-or-update of the Form.io document for a form version, keyed by the
   * deterministic name `soba-{formVersionId}`. Retries converge on a single document.
   */
  async upsertSchema(input: UpsertSchemaInput): Promise<{ engineRef: string }> {
    const client = await getAuthenticatedFormioClient(this.pluginConfig);
    if (!client) {
      throw new Error('Form.io admin client unavailable; cannot upsert form schema');
    }

    const body = buildSchemaBody(input);
    const name = sobaEngineName(input.formVersionId);

    // Find an existing document by the deterministic name so a retry updates instead of duplicating.
    const existing = (await client.loadForms({ params: { name } })) as Array<
      Record<string, unknown>
    >;
    const existingId = existing.length > 0 ? existing[0]._id : undefined;
    if (existingId) {
      body._id = existingId;
    }

    const saved = (await client.saveForm(body).catch(rethrowEngineRejection)) as Record<
      string,
      unknown
    > | null;
    const engineRef = saved?._id;
    if (engineRef == null || engineRef === '') {
      throw new Error('Form.io saveForm did not return an _id');
    }
    return { engineRef: String(engineRef) };
  }

  /** Read the Form.io document by engine ref, stripped of engine-managed fields. Null if not found. */
  async readSchema(engineRef: string): Promise<Record<string, unknown> | null> {
    const client = await getAuthenticatedFormioClient(this.pluginConfig);
    if (!client) {
      throw new Error('Form.io admin client unavailable; cannot read form schema');
    }
    const doc = (await client.loadForm(engineRef)) as Record<string, unknown> | null;
    return doc ? stripEngineManagedFields(doc) : null;
  }

  /** Delete the Form.io document by engine ref (compensation / cleanup). */
  async deleteSchema(engineRef: string): Promise<void> {
    const client = await getAuthenticatedFormioClient(this.pluginConfig);
    if (!client) {
      throw new Error('Form.io admin client unavailable; cannot delete form schema');
    }
    await client.deleteForm(engineRef);
  }

  /** Normalize a schema (import or export) to a clean, portable, builder-ready form definition. */
  normalizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
    return normalizeFormioSchema(schema);
  }

  /**
   * Create a new Form.io submission document under the form `engineFormRef`. Idempotent per
   * `(submissionId, revisionNo)`: a retried save with the same target revision finds the existing
   * document (via the planted correlation key) instead of creating a duplicate.
   */
  async createSubmission(input: CreateSubmissionInput): Promise<{ engineRef: string }> {
    const client = await getAuthenticatedFormioClient(this.pluginConfig);
    if (!client) {
      throw new Error('Form.io admin client unavailable; cannot create submission');
    }

    const key = sobaSubmissionRevisionKey(input.submissionId, input.revisionNo);

    // Idempotency: a retried save (same submission + revision) must converge on one document.
    const existing = (await client.loadSubmissions(input.engineFormRef, {
      params: { [`metadata.${SOBA_REVISION_KEY_FIELD}`]: key },
    })) as Array<Record<string, unknown>>;
    if (existing.length > 0 && existing[0]?._id != null && existing[0]._id !== '') {
      return { engineRef: String(existing[0]._id) };
    }

    const body = buildSubmissionBody(input);
    const saved = (await client
      .saveSubmission(input.engineFormRef, body)
      .catch(rethrowEngineRejection)) as Record<string, unknown> | null;
    const engineRef = saved?._id;
    if (engineRef == null || engineRef === '') {
      throw new Error('Form.io saveSubmission did not return an _id');
    }
    return { engineRef: String(engineRef) };
  }

  /** Read a Form.io submission by form ref + submission ref, stripped of engine-managed fields and
   *  the SOBA correlation `metadata` (internal bookkeeping, not answer content). Null if not found. */
  async readSubmission(
    engineFormRef: string,
    engineRef: string,
  ): Promise<Record<string, unknown> | null> {
    const client = await getAuthenticatedFormioClient(this.pluginConfig);
    if (!client) {
      throw new Error('Form.io admin client unavailable; cannot read submission');
    }
    const doc = (await client.loadSubmission(engineFormRef, engineRef)) as Record<
      string,
      unknown
    > | null;
    if (!doc) return null;
    const cleaned = stripEngineManagedFields(doc);
    delete cleaned.metadata;
    return cleaned;
  }

  /** Delete a Form.io submission by form ref + submission ref (compensation / cleanup). */
  async deleteSubmission(engineFormRef: string, engineRef: string): Promise<void> {
    const client = await getAuthenticatedFormioClient(this.pluginConfig);
    if (!client) {
      throw new Error('Form.io admin client unavailable; cannot delete submission');
    }
    await client.deleteSubmission(engineFormRef, engineRef);
  }
}
