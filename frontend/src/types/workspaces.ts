export type WorkspaceItem = {
  id: string;
  name: string;
  kind: string;
  role: string;
  status: string;
  disclaimerAccepted: boolean;
  useCase: string;
  org: string;
};

export type WorkspacesResponse = {
  items: WorkspaceItem[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    cursorMode: 'id' | 'ts_id';
  };
  filters: {
    kind?: string;
    status?: string;
  };
  sort: string;
};

export type CreateWorkspaceBody = {
  name: string;
  disclaimerAccepted?: boolean;
  useCase: string;
  org: string;
};

export type UpdateWorkspaceBody = {
  name?: string;
  disclaimerAccepted?: boolean;
  useCase: string;
  org: string;
};
