import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@microsoft/fetch-event-source', () => ({
  fetchEventSource: vi.fn(),
}));

vi.mock('rxdb/plugins/replication', () => ({
  replicateRxCollection: vi.fn(() => ({
    cancel: vi.fn(),
    reSync: vi.fn(),
  })),
}));

vi.mock('@/src/shared/api/sobaApi', () => ({
  fetchWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
}));

vi.mock('@/src/shared/config/runtimeConfig', () => ({
  getSobaApiBaseUrl: vi.fn(() => 'http://localhost:4000/api/v1'),
}));

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useRef: vi.fn((val: unknown) => ({ current: val })),
}));

vi.mock('@/src/app/providers/DbProviders', () => ({
  useRxDb: vi.fn(),
}));

vi.mock('@/lib/hooks/useKeycloak', () => ({
  useKeycloak: vi.fn(),
}));

vi.stubGlobal(
  'EventSource',
  class MockEventSource {
    url: string;
    close = vi.fn();
    onmessage: ((event: MessageEvent) => void) | null = null;
    constructor(url: string) {
      this.url = url;
    }
  },
);

import { replicateRxCollection } from 'rxdb/plugins/replication';
import { fetchWorkspaces, createWorkspace, updateWorkspace } from '@/src/shared/api/sobaApi';
import { ApiError } from '@/src/shared/api/sobaHelpers';
import { setupWorkspaceReplication } from '@/lib/rxdb/schemas/workspaceReplication';
import type { RxCollection } from 'rxdb';
import type { WorkspaceItem } from '@/src/types/workspaces';

const mockCollection = {} as RxCollection<WorkspaceItem>;
const TOKEN = 'test-token';

function getPullHandler() {
  const call = vi.mocked(replicateRxCollection).mock.calls[0][0];
  return call.pull!.handler;
}

function getPushHandler() {
  const call = vi.mocked(replicateRxCollection).mock.calls[0][0];
  return call.push!.handler;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchWorkspaces).mockResolvedValue({
    items: [],
    page: { limit: 10, hasMore: false, nextCursor: null, cursorMode: 'id' as const },
    filters: {},
    sort: 'updatedAt:desc',
  });
});

describe('setupWorkspaceReplication', () => {
  it('calls replicateRxCollection with correct identifier', () => {
    setupWorkspaceReplication(mockCollection, TOKEN);

    expect(replicateRxCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        replicationIdentifier: 'workspace-rest-replication',
      }),
    );
  });

  it('sets batchSize to 1 for push', () => {
    setupWorkspaceReplication(mockCollection, TOKEN);

    const config = vi.mocked(replicateRxCollection).mock.calls[0][0];
    expect(config.push!.batchSize).toBe(1);
  });

  it('returns replicationState and cancel', () => {
    const result = setupWorkspaceReplication(mockCollection, TOKEN);

    expect(result).toHaveProperty('replicationState');
    expect(result).toHaveProperty('cancel');
    expect(typeof result.cancel).toBe('function');
  });
});

describe('pull handler', () => {
  it('fetches workspaces without checkpoint on first pull', async () => {
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPullHandler();

    await handler({ updatedAt: '2025-01-01T00:00:00.000Z' }, 100);

    expect(fetchWorkspaces).toHaveBeenCalledWith(
      TOKEN,
      undefined,
      'updatedAt:asc',
    );
  });

  it('fetches workspaces with checkpoint on subsequent pulls', async () => {
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPullHandler();

    await handler({ updatedAt: '2024-01-01T00:00:00.000Z' }, 100);
    await handler({ updatedAt: '2025-01-01T00:00:00.000Z' }, 100);

    expect(fetchWorkspaces).toHaveBeenCalledWith(
      TOKEN,
      '2025-01-01T00:00:00.000Z',
      'updatedAt:asc',
    );
  });

  it('returns documents with _deleted: false', async () => {
    vi.mocked(fetchWorkspaces).mockResolvedValue({
      items: [
        {
          id: 'ws1',
          name: 'Alpha',
          kind: 'team',
          role: 'owner',
          status: 'active',
          disclaimerAccepted: false,
          updatedAt: '2025-06-01T00:00:00.000Z',
        },
      ],
      page: { limit: 10, hasMore: false, nextCursor: null, cursorMode: 'id' as const },
      filters: {},
      sort: 'updatedAt:desc',
    });

    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPullHandler();
    const result = await handler({ updatedAt: '2025-01-01T00:00:00.000Z' }, 100);

    expect(result.documents[0]).toHaveProperty('_deleted', false);
  });

  it('advances checkpoint to last document updatedAt', async () => {
    vi.mocked(fetchWorkspaces).mockResolvedValue({
      items: [
        {
          id: 'ws1',
          name: 'A',
          kind: 'team',
          role: 'owner',
          status: 'active',
          disclaimerAccepted: false,
          updatedAt: '2025-06-01T00:00:00.000Z',
        },
        {
          id: 'ws2',
          name: 'B',
          kind: 'team',
          role: 'member',
          status: 'active',
          disclaimerAccepted: false,
          updatedAt: '2025-06-02T00:00:00.000Z',
        },
      ],
      page: { limit: 10, hasMore: false, nextCursor: null, cursorMode: 'id' as const },
      filters: {},
      sort: 'updatedAt:desc',
    });

    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPullHandler();
    const result = await handler({ updatedAt: '2025-06-02T00:00:00.000Z' }, 100);

    expect(result.checkpoint).toEqual({ updatedAt: '2025-06-02T00:00:00.000Z' });
  });

  it('preserves previous checkpoint when response is empty', async () => {
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPullHandler();
    const prevCheckpoint = { updatedAt: '2025-01-01T00:00:00.000Z' };
    const result = await handler(prevCheckpoint, 100);

    expect(result.checkpoint).toEqual(prevCheckpoint);
    expect(result.documents).toEqual([]);
  });

  it('returns empty documents when response has no items', async () => {
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPullHandler();
    const result = await handler({ updatedAt: '2025-01-01T00:00:00.000Z' }, 100);

    expect(result.documents).toEqual([]);
  });
});

describe('push handler', () => {
  it('creates a new workspace when assumedMasterState is absent', async () => {
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPushHandler();

    const docs = [
      {
        newDocumentState: {
          id: 'ws-new',
          name: 'New Workspace',
          kind: 'team',
          role: 'owner',
          status: 'active',
          disclaimerAccepted: false,
          updatedAt: '2025-06-01T00:00:00.000Z',
          _deleted: false,
        },
      },
    ];

    const result = await handler(docs);

    expect(createWorkspace).toHaveBeenCalledWith(TOKEN, {
      id: 'ws-new',
      name: 'New Workspace',
      disclaimerAccepted: false,
    });
    expect(updateWorkspace).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('updates an existing workspace when assumedMasterState is present', async () => {
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPushHandler();

    const docs = [
      {
        assumedMasterState: {
          id: 'ws1',
          name: 'Old Name',
          updatedAt: '2025-01-01T00:00:00.000Z',
          _deleted: false,
        },
        newDocumentState: {
          id: 'ws1',
          name: 'New Name',
          kind: 'team',
          role: 'owner',
          status: 'active',
          disclaimerAccepted: true,
          updatedAt: '2025-06-01T00:00:00.000Z',
          _deleted: false,
        },
      },
    ];

    const result = await handler(docs);

    expect(updateWorkspace).toHaveBeenCalledWith(TOKEN, 'ws1', {
      name: 'New Name',
      disclaimerAccepted: true,
    });
    expect(createWorkspace).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('returns conflict when updateWorkspace throws', async () => {
    vi.mocked(updateWorkspace).mockRejectedValueOnce(new ApiError('conflict', 409));
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPushHandler();

    const serverState = {
      id: 'ws1',
      name: 'Existing',
      updatedAt: '2025-01-01T00:00:00.000Z',
      _deleted: false as const,
    };
    const docs = [
      {
        assumedMasterState: serverState,
        newDocumentState: {
          ...serverState,
          kind: 'team',
          role: 'owner',
          status: 'active',
          disclaimerAccepted: false,
          _deleted: false,
        },
      },
    ];

    const result = await handler(docs);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(serverState);
  });

  it('returns conflict with newDocumentState when no assumedMasterState and create fails', async () => {
    vi.mocked(createWorkspace).mockRejectedValueOnce(new ApiError('conflict', 409));
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPushHandler();

    const newDoc = {
      id: 'ws-new',
      name: 'New',
      kind: 'team',
      role: 'owner',
      status: 'active',
      disclaimerAccepted: false,
      updatedAt: '2025-06-01T00:00:00.000Z',
      _deleted: false,
    };
    const docs = [{ newDocumentState: newDoc }];

    const result = await handler(docs);

    expect(result).toHaveLength(1);
  });

  it('processes multiple docs sequentially and collects all conflicts', async () => {
    vi.mocked(createWorkspace)
      .mockResolvedValueOnce(undefined as unknown as WorkspaceItem)
      .mockRejectedValueOnce(new ApiError('fail', 409));
    setupWorkspaceReplication(mockCollection, TOKEN);
    const handler = getPushHandler();

    const docs = [
      {
        newDocumentState: {
          id: 'ws-ok',
          name: 'OK',
          kind: 'team',
          role: 'owner',
          status: 'active',
          disclaimerAccepted: false,
          updatedAt: '2025-06-01T00:00:00.000Z',
          _deleted: false,
        },
      },
      {
        newDocumentState: {
          id: 'ws-fail',
          name: 'Fail',
          kind: 'team',
          role: 'owner',
          status: 'active',
          disclaimerAccepted: false,
          updatedAt: '2025-06-02T00:00:00.000Z',
          _deleted: false,
        },
      },
    ];

    const result = await handler(docs);

    expect(createWorkspace).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
  });
});

describe('cancel', () => {
  it('closes eventSource and cancels replication', () => {
    const result = setupWorkspaceReplication(mockCollection, TOKEN);

    result.cancel();

    expect(result.replicationState.cancel).toHaveBeenCalled();
  });
});
