'use client';

import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import {
  addNotification,
  removeNotification,
  clearNotifications,
} from '../slices/notificationSlice';
import type { NotificationType } from '../slices/notificationSlice';

export interface AddNotificationPayload {
  text: string;
  type?: NotificationType;
  consoleError?: unknown;
  title?: string;
}

export function useNotificationStore() {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector((state) => state.notification.notifications);

  // Memoized so callers can safely list these in effect dependency arrays.
  const add = useCallback(
    (payload: AddNotificationPayload) => dispatch(addNotification(payload)),
    [dispatch],
  );
  const remove = useCallback((id: string) => dispatch(removeNotification(id)), [dispatch]);
  const clear = useCallback(() => dispatch(clearNotifications()), [dispatch]);

  return {
    notifications,
    addNotification: add,
    removeNotification: remove,
    clearNotifications: clear,
  };
}
