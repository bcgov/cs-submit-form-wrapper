/** Platform-administration payloads served by the backend `/admin/*` routes. */

export type SobaAdminItem = {
  userId: string;
  source: string;
  identityProviderCode: string | null;
  syncedAt: string | null;
  displayLabel: string | null;
};

export type SobaAdminsResponse = {
  items: SobaAdminItem[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    cursorMode: string;
  };
};

export type FeatureScopeType = 'workspace' | 'form';

export type FeatureScopeStatus = 'active' | 'inactive';

export type FeatureScopeItem = {
  id: string;
  featureCode: string;
  scopeType: FeatureScopeType;
  scopeId: string;
  status: FeatureScopeStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

export type FeatureScopesResponse = {
  items: FeatureScopeItem[];
};

export type UpsertFeatureScopeBody = {
  featureCode: string;
  scopeType: FeatureScopeType;
  scopeId: string;
  status?: FeatureScopeStatus;
};

export type DocumentGenerationAuditItem = {
  id: string;
  workspaceId: string;
  formId: string;
  submissionId: string;
  mode: string;
  backendCode: string;
  outcome: string;
  httpStatus: number | null;
  durationMs: number;
  errorDetail: string | null;
  requestId: string | null;
  createdBy: string;
  createdAt: string;
};

export type DocumentGenerationAuditsResponse = {
  items: DocumentGenerationAuditItem[];
};

export type DocumentGenerationAuditsQuery = {
  workspaceId?: string;
  formId?: string;
  limit?: number;
};
