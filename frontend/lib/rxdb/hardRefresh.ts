import type { RxCollection } from 'rxdb';
import type { RxReplicationState } from 'rxdb/plugins/replication';

/**
 * Triggers a safe "hard refresh" of a replicated RxDB collection.
 * It forces a full sync, and relies on the caller to provide a mechanism
 * (or we just reset the checkpoint) to sync properly. 
 * Since a sledgehammer bulkRemove breaks RxDB conflict resolution for existing docs,
 * we now just trigger a resync. 
 * 
 * To actually clear stale records, the replication logic itself must track seen IDs
 * during a full pull and remove the unseen ones. We will implement that directly 
 * in the replication setup functions.
 */
export async function triggerHardRefresh<RxDocType, CheckpointType>(
  collection: RxCollection<RxDocType>,
  replicationState: RxReplicationState<RxDocType, CheckpointType>,
  setForceFullSync: () => void,
): Promise<void> {
  
  // Force the pull handler to ignore its checkpoint on the next request
  setForceFullSync();
  
  // Trigger a re-sync
  replicationState.reSync();
}
