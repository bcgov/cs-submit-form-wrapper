import { ForbiddenError } from '../../../../src/core/errors';

jest.mock('../../../../src/core/db/repos/idpGroupRepo', () => ({
  canCreateWorkspaceByIdp: jest.fn(),
}));

jest.mock('../../../../src/core/db/repos/membershipRepo', () => ({
  getWorkspaceForUser: jest.fn(),
  listWorkspacesForUser: jest.fn(),
}));

jest.mock('../../../../src/core/db/repos/workspaceRepo', () => ({
  createTeamWorkspace: jest.fn(),
  updateWorkspace: jest.fn(),
}));

import { workspacesApiService } from '../../../../src/core/api/workspaces/service';
import * as idpGroupRepo from '../../../../src/core/db/repos/idpGroupRepo';
import * as membershipRepo from '../../../../src/core/db/repos/membershipRepo';
import * as workspaceRepo from '../../../../src/core/db/repos/workspaceRepo';

const actorId = 'user-1';
const workspaceId = '11111111-1111-7111-8111-111111111111';

const workspaceRow = {
  id: workspaceId,
  name: 'Team Alpha',
  kind: 'team',
  role: 'owner',
  status: 'active',
  org: 'IT',
  useCase: 'Internal',
  membershipId: 'membership-1',
  disclaimerAcceptedAt: null,
};

describe('WorkspacesApiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create provisions a team workspace and returns the workspace item', async () => {
    jest.mocked(idpGroupRepo.canCreateWorkspaceByIdp).mockResolvedValue(true);
    jest.mocked(workspaceRepo.createTeamWorkspace).mockResolvedValue(workspaceId);
    jest.mocked(membershipRepo.getWorkspaceForUser).mockResolvedValue(workspaceRow);

    const result = await workspacesApiService.create(actorId, 'idir', {
      name: 'Team Alpha',
      org: 'IT',
      useCase: 'Internal',
    });

    expect(idpGroupRepo.canCreateWorkspaceByIdp).toHaveBeenCalledWith('idir');

    expect(workspaceRepo.createTeamWorkspace).toHaveBeenCalledWith(
      actorId,
      'Team Alpha',
      'IT',
      'Internal',
      false,
    );
    expect(result).toEqual({
      id: workspaceId,
      name: 'Team Alpha',
      kind: 'team',
      role: 'owner',
      status: 'active',
      org: 'IT',
      useCase: 'Internal',
      disclaimerAccepted: false,
    });
  });

  it('create throws ForbiddenError when IdP is not in the bcgov group', async () => {
    jest.mocked(idpGroupRepo.canCreateWorkspaceByIdp).mockResolvedValue(false);

    await expect(
      workspacesApiService.create(actorId, 'bceidbusiness', {
        name: 'Team Alpha',
        org: 'IT',
        useCase: 'Internal',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(workspaceRepo.createTeamWorkspace).not.toHaveBeenCalled();
  });

  it('updateName returns updated workspace when rename succeeds', async () => {
    jest.mocked(workspaceRepo.updateWorkspace).mockResolvedValue(true);
    jest.mocked(membershipRepo.getWorkspaceForUser).mockResolvedValue({
      ...workspaceRow,
      name: 'Renamed',
    });

    const result = await workspacesApiService.update(workspaceId, actorId, {
      name: 'Renamed',
    });

    expect(workspaceRepo.updateWorkspace).toHaveBeenCalledWith(workspaceId, actorId, {
      name: 'Renamed',
    });
    expect(result?.name).toBe('Renamed');
  });

  it('updateName throws ForbiddenError when actor cannot rename', async () => {
    jest.mocked(workspaceRepo.updateWorkspace).mockResolvedValue(false);

    await expect(
      workspacesApiService.update(workspaceId, actorId, { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('updateName returns null when workspace is missing after update', async () => {
    jest.mocked(workspaceRepo.updateWorkspace).mockResolvedValue(true);
    jest.mocked(membershipRepo.getWorkspaceForUser).mockResolvedValue(null);

    const result = await workspacesApiService.update(workspaceId, actorId, {
      name: 'Renamed',
    });

    expect(result).toBeNull();
  });
});
