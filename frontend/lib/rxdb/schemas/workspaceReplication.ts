import { replicateRxCollection } from 'rxdb/plugins/replication';
import { fetchWorkspaces, createWorkspace, updateWorkspace } from '@/src/shared/api/sobaApi';
import { ApiError } from '@/src/shared/api/sobaHelpers';
import { getSobaApiBaseUrl } from '@/src/shared/config/runtimeConfig';
import type { RxCollection, RxReplicationWriteToMasterRow, WithDeleted } from 'rxdb';
import type { WorkspaceItem } from '@/src/types/workspaces';
import { useEffect, useRef } from 'react';
import { useRxDb } from '@/src/app/providers/DbProviders';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import { setupSseReplication } from '@/lib/rxdb/sseHelper';

const processWorkspacePush = async (
  doc: RxReplicationWriteToMasterRow<WorkspaceItem>,
  token: string
) => {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Offline');
    }
    if (doc.newDocumentState._deleted) {
      return null;
    }
    const isNew = !doc.assumedMasterState;
    if (isNew) {
      await createWorkspace(token, {
        id: doc.newDocumentState.id,
        name: doc.newDocumentState.name,
        disclaimerAccepted: doc.newDocumentState.disclaimerAccepted,
      });
    } else {
      await updateWorkspace(token, doc.newDocumentState.id, {
        name: doc.newDocumentState.name,
        disclaimerAccepted: doc.newDocumentState.disclaimerAccepted,
      });
    }
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      return doc.assumedMasterState || doc.newDocumentState;
    }
    throw err;
  }
};

export function setupWorkspaceReplication(collection: RxCollection<WorkspaceItem>, token: string) {
  let isFirstPull = true;

  const replicationState = replicateRxCollection({
    collection,
    replicationIdentifier: `workspace-rest-replication`,
    pull: {
      async handler(lastCheckpoint?: { updatedAt: string }) {
        let updatedSince = lastCheckpoint?.updatedAt;
        if (isFirstPull) {
          updatedSince = undefined;
        }

        const response = await fetchWorkspaces(token, updatedSince, 'updatedAt:asc');

        const documents = response.items.map((item) => ({
          ...item,
          _deleted: false,
          serverSynced: true,
        })) as WithDeleted<WorkspaceItem>[];
        const lastDoc = documents.at(-1);

        const nextCheckpoint = lastDoc
          ? { updatedAt: lastDoc.updatedAt || new Date().toISOString() }
          : lastCheckpoint;

        if (isFirstPull) {
          isFirstPull = false;
          const seenIds = new Set(response.items.map(item => item.id));
          setTimeout(async () => {
            try {
              const allLocal = await collection.find().exec();
              const staleDocs = allLocal.filter(d => {
                const data = d.toJSON() as { serverSynced?: boolean };
                return data.serverSynced !== false && !seenIds.has(d.get('id'));
              });
              if (staleDocs.length > 0) {
                await collection.bulkRemove(staleDocs.map(d => d.get('id')));
              }
            } catch {}
          }, 1000);
        }

        return {
          documents,
          checkpoint: nextCheckpoint,
        };
      },
    },
    push: {
      async handler(docs) {
        const conflicts: WithDeleted<WorkspaceItem>[] = [];
        for (const doc of docs) {
          const conflict = await processWorkspacePush(doc, token);
          if (conflict) {
            conflicts.push(conflict);
          }
        }
        return conflicts;
      },
      batchSize: 1,
    },
  });

  const abortController = new AbortController();
  const sseUrl = `${getSobaApiBaseUrl()}/workspaces/stream`;

  setupSseReplication({
    sseUrl,
    token,
    abortController,
    onMessage: (data: unknown) => {
      if (data && typeof data === 'object' && 'id' in data) {
        replicationState.reSync();
      }
    },
  });

  return {
    replicationState,
    cancel: () => {
      replicationState.cancel();
      abortController.abort();
    },
  };
}

export function useWorkspaceReplication() {
  const db = useRxDb();
  const { token, authenticated } = useKeycloak();
  const isOnline = useNetworkStatus();
  const ref = useRef<ReturnType<typeof setupWorkspaceReplication> | null>(null);

  useEffect(() => {
    let pushSub: import('rxjs').Subscription | undefined;
    let errorSub: import('rxjs').Subscription | undefined;
    let intervalId: NodeJS.Timeout;

    if (db && authenticated && token && isOnline && !ref.current) {
      ref.current = setupWorkspaceReplication(db.workspaces, token);
      const { replicationState } = ref.current;

      errorSub = replicationState.error$.subscribe(() => {});
      pushSub = replicationState.active$.subscribe(() => {});

      // Periodic sync as a fallback to ensure stuck pushes are retried
      intervalId = setInterval(() => {
        if (ref.current) {
          ref.current.replicationState.reSync();
        }
      }, 5 * 60 * 1000); // 5 minutes
    }
    
    return () => {
      if (errorSub) errorSub.unsubscribe();
      if (pushSub) pushSub.unsubscribe();
      if (intervalId) clearInterval(intervalId);
      if (ref.current && !isOnline) {
        ref.current.cancel();
        ref.current = null;
      }
    };
  }, [db, token, authenticated, isOnline]);

  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.cancel();
        ref.current = null;
      }
    };
  }, []);
}
