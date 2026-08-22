/** Result of a form engine readiness check; no config or credentials are exposed. */
export interface FormEngineReadinessResult {
  ok: boolean;
  message?: string;
}

/** Input for upserting a form schema into the engine; idempotent by form version. */
export interface UpsertSchemaInput {
  /** SOBA form_version id; used to derive the deterministic engine identity. */
  formVersionId: string;
  /** SOBA workspace id; recorded on the engine document for tenancy/filtering. */
  workspaceId: string;
  /** The form definition (Form.io schema JSON) to store. */
  schema: Record<string, unknown>;
  /** Optional human-readable title; defaults to the schema's own title. */
  title?: string;
}

/** Input for creating a new (immutable) submission document in the engine for a save/revision. */
export interface CreateSubmissionInput {
  /** Engine ref of the form the submission belongs to (the form version's engineSchemaRef). */
  engineFormRef: string;
  /** SOBA submission id; part of the deterministic per-revision idempotency key. */
  submissionId: string;
  /** Target revision number for this save; part of the idempotency key. */
  revisionNo: number;
  /** SOBA workspace id; recorded on the engine document for tenancy/filtering. */
  workspaceId: string;
  /** The submission answer data to store. */
  data: Record<string, unknown>;
}

export interface FormEngineAdapter {
  /** Optional: report whether the engine is reachable (readiness). No config in result. */
  readinessCheck?(): Promise<FormEngineReadinessResult>;
  /**
   * Create or update the engine document for a form version, keyed by a deterministic
   * identity derived from `formVersionId`. Idempotent: safe to retry. Returns the engine ref.
   */
  upsertSchema?(input: UpsertSchemaInput): Promise<{ engineRef: string }>;
  /** Read the engine document by ref. Returns null if not found. */
  readSchema?(engineRef: string): Promise<Record<string, unknown> | null>;
  /** Delete the engine document by ref (compensation / cleanup). */
  deleteSchema?(engineRef: string): Promise<void>;
  /**
   * Create a new submission document under `engineFormRef`. Each save makes a new (immutable)
   * document; idempotent per `(submissionId, revisionNo)` via a planted correlation key, so a
   * retried save converges on one document. Returns the engine ref.
   */
  createSubmission?(input: CreateSubmissionInput): Promise<{ engineRef: string }>;
  /** Read a submission document by form ref + submission ref, stripped of engine-managed fields. Null if not found. */
  readSubmission?(
    engineFormRef: string,
    engineRef: string,
  ): Promise<Record<string, unknown> | null>;
  /** Delete a submission document by form ref + submission ref (compensation / cleanup). */
  deleteSubmission?(engineFormRef: string, engineRef: string): Promise<void>;
  /**
   * Normalize a schema (imported file or exported design) into a clean, portable,
   * builder-ready form definition for this engine. Pure transform — no engine call.
   * Returns the schema unchanged if the engine has nothing to do.
   */
  normalizeSchema?(schema: Record<string, unknown>): Record<string, unknown>;
}
