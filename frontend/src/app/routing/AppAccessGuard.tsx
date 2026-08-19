'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, InlineAlert } from '@bcgov/design-system-react-components';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { useDictionary } from '@/app/[lang]/Providers';
import { useAppDispatch } from '@/lib/store';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { clearCurrentUser } from '@/lib/slices/currentUserSlice';
import { clearWorkspaceState } from '@/lib/slices/workspaceSlice';
import { resolveRedirect } from './appRoutePolicy';
import { useAppSession } from './useAppSession';

type AppAccessGuardProps = {
  locale: string;
  workspacesEnabled: boolean;
  children: React.ReactNode;
};

/** Central session bootstrap and route access policy for localized app routes. */
export function AppAccessGuard({
  locale,
  workspacesEnabled,
  children,
}: Readonly<AppAccessGuardProps>) {
  const dict = useDictionary();
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { refresh } = useKeycloak();
  const session = useAppSession();

  const redirectTarget = useMemo(() => {
    return resolveRedirect(pathname, locale, session, workspacesEnabled);
  }, [pathname, locale, session, workspacesEnabled]);

  useEffect(() => {
    if (redirectTarget) {
      router.replace(redirectTarget);
    }
  }, [redirectTarget, router]);

  const handleRetry = useCallback(async () => {
    // Hopefully this never happens, but better safe than sorry.
    // Too many things loading at once so a failure is possible.
    // A failed bootstrap load is often an expired access token, which a plain refresh would just hit again.
    // Refresh first (best-effort): on success the
    // store holds a fresh token; if the refresh token is also expired, refreshToken
    // clears auth, which redirects the user to sign in again. Resetting the slices
    // to 'idle' lets useAppSession re-dispatch the loads with the current token.
    await refresh();
    dispatch(clearCurrentUser());
    dispatch(clearWorkspaceState());
  }, [refresh, dispatch]);

  if (session.sessionFailed && !redirectTarget) {
    return (
      <div className="mt-4" role="alert">
        <InlineAlert variant="danger">{dict.general.sessionError}</InlineAlert>
        <div className="mt-3">
          <Button
            type="button"
            variant="primary"
            onPress={() => {
              handleRetry().catch(() => undefined);
            }}
            data-testid="session-error-retry"
          >
            {dict.general.tryAgain}
          </Button>
        </div>
      </div>
    );
  }

  const showLoading =
    session.initializing ||
    (session.authenticated && !session.sessionReady && !session.sessionFailed) ||
    redirectTarget !== null;

  if (showLoading) {
    return <CenteredProgress label={dict.general.loading} minHeight="50vh" />;
  }

  return <>{children}</>;
}
