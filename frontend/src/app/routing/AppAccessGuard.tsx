'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, InlineAlert } from '@bcgov/design-system-react-components';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { useDictionary } from '@/app/[lang]/Providers';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useRefreshWorkspaces } from '@/src/shared/api/useWorkspaces';
import { useRefreshCurrentUser } from '@/src/shared/api/useCurrentUser';
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
  const { refresh } = useKeycloak();
  const refreshWorkspaces = useRefreshWorkspaces();
  const refreshCurrentUser = useRefreshCurrentUser();
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
    // A failed bootstrap read is usually an expired token, so refresh before re-reading. If the
    // refresh token has also expired, refreshing clears auth and the user is sent to sign in.
    // All three reads are retried: a partial retry leaves the others failed and the alert up.
    await refresh();
    await Promise.all([refreshWorkspaces(), refreshCurrentUser()]);
  }, [refresh, refreshWorkspaces, refreshCurrentUser]);

  // Same rule as the spinner below: once bootstrapped, a failed background reload must not replace
  // the route either. The retry lives on the next full load.
  if (session.sessionFailed && !session.sessionLoadedOnce && !redirectTarget) {
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

  // Only the first load hides the app. A background reload (a token rotation re-reading /me) must
  // not swap children for the spinner — unmounting the route would discard a form being filled.
  const showLoading =
    !session.sessionLoadedOnce &&
    (session.initializing ||
      (session.authenticated && !session.sessionReady && !session.sessionFailed));

  if (showLoading || redirectTarget !== null) {
    return <CenteredProgress label={dict.general.loading} minHeight="50vh" />;
  }

  return <>{children}</>;
}
