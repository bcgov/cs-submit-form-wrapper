import { replicateRxCollection } from 'rxdb/plugins/replication';
import { getSobaSubmissions } from '@/src/shared/api/sobaApiDesign';
import { getSobaApiBaseUrl } from '@/src/shared/config/runtimeConfig';
import type { RxCollection, WithDeleted } from 'rxdb';
import type { SubmissionListItem } from '@/src/types/submissions';
import { useEffect, useRef } from 'react';
import { useRxDb } from '@/src/app/providers/DbProviders';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import { useAppSelector } from '@/lib/store';
import { fetchEventSource } from '@microsoft/fetch-event-source';


export function setupSubmissionReplication(
  collection: RxCollection<SubmissionListItem>,
  token: string,
  workspaceId: string,
) {
  let isFirstPull = true;
  let seenIdsDuringFullSync: Set<string> | null = null;

  const replicationState = replicateRxCollection({
    collection,
    replicationIdentifier: `submission-rest-replication-${workspaceId}`,
    pull: {
      async handler(lastCheckpoint?: { updatedAt: string }) {
        let cursorStr = undefined;
        
        if (isFirstPull) {
          lastCheckpoint = undefined;
          isFirstPull = false;
          seenIdsDuringFullSync = new Set();
        }
        if (lastCheckpoint?.updatedAt) {
          const cursor = { m: 'ts_id', ts: lastCheckpoint.updatedAt };
          cursorStr = Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
        }

        const params: Record<string, string | number> = { sort: 'updatedAt:asc', limit: 100 };
        if (cursorStr) {
          params.cursor = cursorStr;
        }

        const response = await getSobaSubmissions(token, params, workspaceId);

        const documents = response.items.map((item) => {
          if (seenIdsDuringFullSync) seenIdsDuringFullSync.add(item.id);
          return {
            ...item,
            _deleted: false,
            serverSynced: true,
          };
        }) as WithDeleted<SubmissionListItem>[];

        const lastDoc = documents.at(-1);
        const nextCheckpoint = lastDoc
          ? { updatedAt: lastDoc.updatedAt || new Date().toISOString(), id: lastDoc.id }
          : lastCheckpoint;

        // Submissions API uses limit=100 pagination. If we get less than 100, we're on the last page.
        if (seenIdsDuringFullSync && documents.length < 100) {
          const finalSeenIds = seenIdsDuringFullSync;
          seenIdsDuringFullSync = null; // Mark full sync as complete
          
          setTimeout(async () => {
            try {
              const allLocal = await collection.find().exec();
              const staleDocs = allLocal.filter(d => {
                const data = d.toJSON() as { serverSynced?: boolean };
                return data.serverSynced !== false && !finalSeenIds.has(d.get('id'));
              });
              if (staleDocs.length > 0) {
                await collection.bulkRemove(staleDocs.map(d => d.get('id')));
              }
            } catch {
              // Silently ignore purge errors
            }
          }, 1000);
        }

        return {
          documents,
          checkpoint: nextCheckpoint,
        };
      },
    },
    // No push replication for the list items themselves; submissions are created via forms
    // and updated via separate endpoints or the submissionDataReplication.
  });

  const abortController = new AbortController();
  const sseUrl = `${getSobaApiBaseUrl()}/design/submissions/stream`;

  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let currentRetryDelay = 1000;
  const MAX_RETRY_DELAY = 30000;

  fetchEventSource(sseUrl, {
    method: 'GET',
    headers,
    signal: abortController.signal,
    openWhenHidden: true,

    async onopen(response) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Stream connection failed with status: ${response.status}`);
      }
      if (!response.ok) {
        throw new Error(`Server returned unexpected error status: ${response.status}`);
      }
      currentRetryDelay = 1000;
    },

    async onmessage(event) {
      try {
        const data = JSON.parse(event.data);
        if (data?.id) {
          replicationState.reSync();
        }
      } catch {}
    },

    onerror() {
      const delayToWait = currentRetryDelay;
      currentRetryDelay = Math.min(currentRetryDelay * 2, MAX_RETRY_DELAY);
      return delayToWait;
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

export function useSubmissionReplication() {
  const db = useRxDb();
  const { token, authenticated } = useKeycloak();
  const { activeWorkspaceId } = useAppSelector((state) => state.workspace);
  const isOnline = useNetworkStatus();
  const ref = useRef<ReturnType<typeof setupSubmissionReplication> | null>(null);

  useEffect(() => {
    let pushSub: import('rxjs').Subscription | undefined;
    let errorSub: import('rxjs').Subscription | undefined;
    let intervalId: NodeJS.Timeout;

    if (db && authenticated && token && activeWorkspaceId && isOnline && !ref.current) {
      ref.current = setupSubmissionReplication(db.submissions, token, activeWorkspaceId);
      const { replicationState } = ref.current;

      // Log replication errors for debugging
      errorSub = replicationState.error$.subscribe(() => {});

      pushSub = replicationState.active$.subscribe(() => {});

      // Periodic sync as a fallback
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
  }, [db, token, authenticated, activeWorkspaceId, isOnline]);

  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.cancel();
        ref.current = null;
      }
    };
  }, []);
}
