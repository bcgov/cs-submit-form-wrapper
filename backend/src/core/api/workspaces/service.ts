import {
  getWorkspaceForUser,
  listWorkspacesForUser,
  type WorkspaceListSort,
} from '../../db/repos/membershipRepo';
import { canCreateWorkspaceByIdp } from '../../db/repos/idpGroupRepo';
import { createTeamWorkspace, updateWorkspace } from '../../db/repos/workspaceRepo';
import { ForbiddenError } from '../../errors';

export class WorkspacesApiService {
  async list(
    actorId: string,
    query: {
      offset: number;
      limit: number;
      kind?: string;
      status?: string;
      q?: string;
      requiredPermission?: string;
      sort: WorkspaceListSort;
    },
  ) {
    const { items, total } = await listWorkspacesForUser({
      userId: actorId,
      offset: query.offset,
      limit: query.limit,
      sort: query.sort,
      kind: query.kind,
      status: query.status,
      q: query.q,
      requiredPermission: query.requiredPermission,
    });
    return {
      items: items.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        role: r.role,
        status: r.status,
        org: r.org,
        useCase: r.useCase,
        disclaimerAccepted: r.disclaimerAcceptedAt != null,
      })),
      page: {
        offset: query.offset,
        limit: query.limit,
        total,
      },
      filters: {
        kind: query.kind,
        status: query.status,
        q: query.q,
        requiredPermission: query.requiredPermission,
      },
      sort: query.sort,
    };
  }

  async getCurrent(workspaceId: string, actorId: string) {
    const row = await getWorkspaceForUser(workspaceId, actorId);
    if (!row) return null;
    return this.toWorkspaceItem(row);
  }

  private toWorkspaceItem(row: {
    id: string;
    name: string;
    kind: string;
    role: string;
    status: string;
    org: string | null;
    useCase: string | null;
    disclaimerAcceptedAt: Date | null;
  }) {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      role: row.role,
      status: row.status,
      org: row.org,
      useCase: row.useCase,
      disclaimerAccepted: row.disclaimerAcceptedAt != null,
    };
  }

  async create(
    actorId: string,
    idpCode: string | null,
    body: { name: string; org: string; useCase: string; disclaimerAccepted?: boolean },
  ) {
    const canCreate = await canCreateWorkspaceByIdp(idpCode);
    if (!canCreate) {
      throw new ForbiddenError(
        'Only users authenticated through a BC Government identity provider can create workspaces',
      );
    }
    const workspaceId = await createTeamWorkspace(
      actorId,
      body.name,
      body.org,
      body.useCase,
      body.disclaimerAccepted ?? false,
    );
    const row = await getWorkspaceForUser(workspaceId, actorId);
    if (!row) {
      throw new Error('Created workspace could not be loaded');
    }
    return this.toWorkspaceItem(row);
  }

  async update(
    workspaceId: string,
    actorId: string,
    body: { name?: string; org?: string; useCase?: string; disclaimerAccepted?: boolean },
  ) {
    const updated = await updateWorkspace(workspaceId, actorId, body);
    if (!updated) {
      throw new ForbiddenError('Only workspace owners or admins can manage this workspace');
    }
    const row = await getWorkspaceForUser(workspaceId, actorId);
    if (!row) return null;
    return this.toWorkspaceItem(row);
  }
}

export const workspacesApiService = new WorkspacesApiService();
