import { useMemo } from 'react';
import { useAppSelector } from './store';

export function useCurrentUser() {
  const data = useAppSelector((state) => state.currentUser.data);
  const status = useAppSelector((state) => state.currentUser.status);
  const error = useAppSelector((state) => state.currentUser.error);

  const displayName = useMemo(() => {
    return (
      data?.actor.displayLabel ??
      data?.profile.displayName ??
      data?.profile.preferredUsername ??
      null
    );
  }, [data]);

  return {
    data,
    actor: data?.actor ?? null,
    profile: data?.profile ?? null,
    displayName,
    status,
    error: error ?? null,
    isLoading: status === 'loading',
    isLoaded: status === 'succeeded',
    hasError: status === 'failed',
  };
}
