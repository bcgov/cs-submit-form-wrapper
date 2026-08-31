import type { ListPage } from './list';

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
  page: ListPage;
  filters: {
    kind?: string;
    status?: string;
    q?: string;
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
