'use client';

import { useEffect, useRef } from 'react';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { useRxDb } from '@/src/app/providers/DbProviders';
import type { RxChangeEvent } from 'rxdb';
import { useDictionary } from '@/app/[lang]/Providers';

export function NetworkAndSyncAlerts() {
  const { addNotification } = useNotificationStore();
  const db = useRxDb();
  const dict = useDictionary();
  const offlineDict = dict.offline;

  // Track if we were recently offline to avoid spamming "online" on first load
  const wasOffline = useRef(false);

  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true;
      addNotification({
        title: offlineDict.networkOfflineTitle,
        text: offlineDict.networkOfflineText,
        type: 'warning',
      });
    };

    const handleOnline = () => {
      if (wasOffline.current) {
        addNotification({
          title: offlineDict.connectionRestoredTitle,
          text: offlineDict.connectionRestoredText,
          type: 'success',
        });
        wasOffline.current = false;
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [
    addNotification,
    offlineDict.networkOfflineTitle,
    offlineDict.networkOfflineText,
    offlineDict.connectionRestoredTitle,
    offlineDict.connectionRestoredText,
  ]);

  // Track if any local changes were made while offline
  const hadOfflineChanges = useRef(false);

  useEffect(() => {
    if (!db) return;

    const handleSyncEvent = (event: RxChangeEvent<unknown>) => {
      const curr = event.documentData as { serverSynced?: boolean };
      const prev = event.previousDocumentData as { serverSynced?: boolean };

      // If this is a local edit (not yet synced)
      if (!curr?.serverSynced) {
        // If they are offline when making the edit, flag that we have pending offline changes
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          hadOfflineChanges.current = true;
        }
      }
      // If a document was locally modified and is now synced (true)
      else if (prev && !prev.serverSynced && curr.serverSynced) {
        if (hadOfflineChanges.current) {
          addNotification({
            title: offlineDict.syncCompleteTitle,
            text: offlineDict.syncCompleteText,
            type: 'success',
          });
          // Reset the flag so we don't notify on subsequent normal online saves
          hadOfflineChanges.current = false;
        }
      }
    };

    const subs = [
      db.workspaces.$.subscribe(handleSyncEvent),
      db.submissions.$.subscribe(handleSyncEvent),
      db.submissionData.$.subscribe(handleSyncEvent),
    ];

    return () => subs.forEach((s) => s.unsubscribe());
  }, [db, addNotification, offlineDict.syncCompleteTitle, offlineDict.syncCompleteText]);

  return null; // This is a logic-only component
}
