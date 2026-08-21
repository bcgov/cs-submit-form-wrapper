export type SobaFormType = {
  name: string;
  description: string;
  formEngineCode?: string;
  workspaceId?: string;
};

export type CreateSobaFormioFormResponse = {
  createdAt: Date;
  description: string;
  id: string;
  workspaceId: string;
  name: string;
  status: string;
  updatedAt: Date;
  // POST /forms now returns the form plus its initial v1 draft (FormWithVersionResponse).
  formVersion?: SobaFormVersionType | null;
};

export type SobaResponseFormType = {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  formEngineCode?: string;
};

export type SobaFormVersionType = {
  id: string;
  versionNo: number;
  state: string;
  engineSyncStatus: string;
  engineSchemaRef?: string | null;
  currentRevisionNo: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

// Submit-mode payload: the published form + version + schema needed to render the public fill page.
/** The one payload the fill page needs: workflow state + schema + any saved answers (resume). */
export type SubmitFillBundle = {
  workflowState: string;
  schema: Record<string, unknown> | null;
  // The submission's answer document; null for a just-opened submission (no saved answers yet).
  content: { data?: Record<string, unknown> } | null;
};
