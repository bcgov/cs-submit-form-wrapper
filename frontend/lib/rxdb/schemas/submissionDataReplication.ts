import { replicateRxCollection } from 'rxdb/plugins/replication';
import type { RxReplicationWriteToMasterRow } from 'rxdb';
import {
  saveSobaFormSubmission,
  submitSobaFormSubmission,
  getSubmitSubmissionData,
} from '@/src/shared/api/sobaApi';
import { ApiError } from '@/src/shared/api/sobaHelpers';
import { getSobaApiBaseUrl } from '@/src/shared/config/runtimeConfig';
import type { RxCollection } from 'rxdb';
import { useEffect, useRef } from 'react';
import { useRxDb } from '@/src/app/providers/DbProviders';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';
import type { SubmissionDataDocument } from './submissionDataSchema';
import { deepEqual } from '@/src/shared/util/deepEqual';
import { setupSseReplication } from '@/lib/rxdb/sseHelper';

interface StreamPayload {
  id: string;
  data: Record<string, unknown>;
  updatedAt?: string;
  isDraft?: boolean;
}

const handlePushError = async (
  err: unknown,
  doc: RxReplicationWriteToMasterRow<SubmissionDataDocument>,
  token: string | undefined
) => {
  if (err instanceof ApiError && err.status === 409) {
    try {
      const serverS = await getSubmitSubmissionData(token, doc.newDocumentState.id);
      if (serverS && serverS.data) {
        return {
          id: doc.newDocumentState.id,
          data: serverS.data,
          updatedAt: new Date().toISOString(),
          isDraft: false,
          serverSynced: true,
          _deleted: false,
        };
      }
    } catch {
      throw err;
    }
    return doc.assumedMasterState || doc.newDocumentState;
  }

  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return doc.assumedMasterState || doc.newDocumentState;
  }

  throw err;
};

const processPushDocument = async (
  doc: RxReplicationWriteToMasterRow<SubmissionDataDocument>,
  token: string | undefined
) => {
  const data = doc.newDocumentState.data;
  const submissionId = doc.newDocumentState.id;
  try {
    if (typeof navigator === 'undefined' || !navigator.onLine) {
      throw new Error('Offline');
    }
    if (!deepEqual(doc.assumedMasterState?.data, data)) {
      if (doc.newDocumentState.isDraft) {
        await saveSobaFormSubmission(token, submissionId, data);
      } else {
        await submitSobaFormSubmission(token, submissionId, data);
      }
    }
    return null;
  } catch (err) {
    return handlePushError(err, doc, token);
  }
};

export function setupSubmissionDataReplication(
  collection: RxCollection<SubmissionDataDocument>,
  token: string | undefined,
  onAuthRequired?: () => void, // Optional callback to trigger a token refresh upstream
) {
  const replicationState = replicateRxCollection({
    collection,
    replicationIdentifier: `submission-data-rest-replication`,
    pull: {
      async handler(lastCheckpoint?: { updatedAt: string }) {
        return { documents: [] as import('rxdb').WithDeleted<SubmissionDataDocument>[], checkpoint: lastCheckpoint };
      },
    },
    push: {
      async handler(docs) {
        const conflicts: import('rxdb').WithDeleted<SubmissionDataDocument>[] = [];
        for (const doc of docs) {
          const conflict = await processPushDocument(doc, token);
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
  const sseUrl = `${getSobaApiBaseUrl()}/submit/submissions/stream`;

  setupSseReplication({
    sseUrl,
    token,
    abortController,
    onAuthRequired,
    onMessage: async (data: unknown) => {
      try {
        const parsed = data as unknown;
        if (isStreamPayload(parsed)) {
          await collection.upsert({
            id: parsed.id,
            data: parsed.data,
            updatedAt: parsed.updatedAt || new Date().toISOString(),
            isDraft: parsed.isDraft !== undefined ? parsed.isDraft : true,
            serverSynced: true,
          });
        }
      } catch {}
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

function isStreamPayload(obj: unknown): obj is StreamPayload {
  if (typeof obj !== 'object' || obj === null) return false;
  const candidate = obj as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.data === 'object' &&
    candidate.data !== null
  );
}

export function useSubmissionDataReplication() {
  const db = useRxDb();
  const { token } = useKeycloak();
  const isOnline = useNetworkStatus();
  const ref = useRef<ReturnType<typeof setupSubmissionDataReplication> | null>(null);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (db && !ref.current && isOnline) {
      ref.current = setupSubmissionDataReplication(db.submissionData, token, () => {});

      intervalId = setInterval(() => {
        if (ref.current) {
          ref.current.replicationState.reSync();
        }
      }, 5 * 60 * 1000); // 5 minutes
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
      if (ref.current && !isOnline) {
        ref.current.cancel();
        ref.current = null;
      }
    };
  }, [db, token, isOnline]);

  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.cancel();
        ref.current = null;
      }
    };
  }, []);
}
