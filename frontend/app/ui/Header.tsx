'use client';
import { useEffect, useRef, useMemo } from 'react';
import { useSWRConfig } from 'swr';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Dropdown } from 'react-bootstrap';
import { Header as BCHeader } from '@bcgov/design-system-react-components';
import { FaUser } from 'react-icons/fa6';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useCurrentUser } from '@/src/shared/api/useCurrentUser';
import { useWorkspaces } from '@/src/shared/api/useWorkspaces';
import { useDictionary } from '../[lang]/Providers';
import { LoginButton } from './LoginButton';
import { LanguageSelector, type LanguageOption } from './LanguageSelector';
import type { PluginNavItem } from '@/src/types/plugins';
import { WorkspaceModal, WORKSPACE_MODAL_DISMISSED_KEY } from '@/src/components/WorkspaceModal';
import { forgetListQueries } from '@/src/shared/list/listQueryMemory';
import { removeSessionValues } from '@/src/shared/storage/sessionStore';
import { isIdentityEnded } from '@/src/shared/auth/sessionIdentity';

import styles from './Header.module.css';

type HeaderProps = {
  headerNavItems: PluginNavItem[];
  overlayNavItems: PluginNavItem[];
  showWorkspaces: boolean;
};

function Header({ headerNavItems, showWorkspaces }: Readonly<HeaderProps>) {
  const dict = useDictionary();
  const locale = dict.locale === 'en' || dict.locale === 'fr' ? dict.locale : 'en';
  const languageOptions: LanguageOption[] = Object.entries(dict.header.languages).map(
    ([value, label]) => ({ value, label }),
  );
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authenticated, idTokenParsed, token, logout, init, refresh, initStarted, initializing } =
    useKeycloak();
  const currentUser = useCurrentUser();
  const { workspaces, loaded: workspacesLoaded } = useWorkspaces();
  const { mutate } = useSWRConfig();

  const headerChromeRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const previousSubjectRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    init();
  }, [init]);

  // The aside sticks below the header, so its height has to be a real number. It is a design system
  // component and varies with viewport and signed-in state, so measure rather than assume.
  useEffect(() => {
    const chrome = headerChromeRef.current;
    if (!chrome) return;
    const publishHeight = () => {
      document.documentElement.style.setProperty(
        '--app-header-height',
        `${chrome.getBoundingClientRect().height}px`,
      );
    };
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(chrome);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const currentSubject =
      authenticated && typeof idTokenParsed?.sub === 'string' ? idTokenParsed.sub : undefined;

    if (
      isIdentityEnded({
        previousSubject: previousSubjectRef.current,
        currentSubject,
        authenticated,
        initStarted,
        initializing,
      })
    ) {
      // The cache and this tab's view state outlive the session. The next person signing in here
      // would otherwise be served the previous user's workspaces and their list filters.
      void mutate(() => true, undefined, { revalidate: false });
      removeSessionValues((key) => key === WORKSPACE_MODAL_DISMISSED_KEY);
      forgetListQueries();
    }
    // Held past a transient: a rotation between renders must not read as a departure.
    if (currentSubject !== undefined || (initStarted && !initializing)) {
      previousSubjectRef.current = currentSubject;
    }

    if (!authenticated || !token) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
      return;
    }
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        refresh();
      }, 30000);
    }
  }, [authenticated, token, idTokenParsed, refresh, mutate, initStarted, initializing]);

  const hasWorkspaces = useMemo(() => workspaces.length > 0, [workspaces.length]);
  const canCreateWorkspace = currentUser.data?.capabilities?.canCreateWorkspace === true;

  const handleLogout = () => {
    void mutate(() => true, undefined, { revalidate: false });
    logout();
  };

  const handleLanguageChange = (newLocale: string) => {
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
      const search = searchParams.toString();
      router.push(search ? `${newPath}?${search}` : newPath);
    } else {
      router.push(`/${newLocale}/`);
    }
  };

  const authActions = () => {
    // The cache is cleared on sign-out, so anything loaded belongs to the current session. Matching
    // on the token instead would blank the name every time the token rotates.
    const backendDisplayName = currentUser.displayName;
    const keycloakDisplayName =
      typeof idTokenParsed?.display_name === 'string' &&
      idTokenParsed.display_name.trim().length > 0
        ? idTokenParsed.display_name
        : null;
    let displayName: string | null;
    if (typeof backendDisplayName === 'string' && backendDisplayName.trim().length > 0) {
      displayName = backendDisplayName;
    } else if (currentUser.hasError) {
      displayName = keycloakDisplayName ?? 'Authenticated User';
    } else if (currentUser.loaded) {
      displayName = 'Authenticated User';
    } else {
      displayName = null;
    }

    const authenticatedUserMenu = displayName ? (
      <Dropdown>
        <Dropdown.Toggle className={styles.userDrop} data-testid="user-dropdown" id="dropdown-user">
          <FaUser className="align-text-top" aria-hidden="true" />
          <span className={styles.limitText + ' ms-2 me-2'}>{displayName}</span>
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item onClick={handleLogout} data-testid="logout-button">
            {dict.general.logout}
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    ) : (
      <span aria-hidden="true" className={styles.userNameSkeleton} />
    );

    return (
      <div className="d-flex align-items-center justify-content-end gap-3">
        <LanguageSelector
          locale={locale}
          label={dict.header.selectLanguage}
          options={languageOptions}
          onChange={handleLanguageChange}
        />

        {authenticated ? (
          authenticatedUserMenu
        ) : (
          <LoginButton variant="secondary" data-testid="login-button" label={dict.general.login} />
        )}
      </div>
    );
  };

  return (
    <div ref={headerChromeRef} data-testid="app-header">
      <BCHeader
        logoLinkElement={
          <Link href="/" data-testid="bcgov-header-logo" title={dict.header.bcgovTitle} />
        }
        title={dict.general.title}
        titleElement="span"
        skipLinks={[
          <a key="skip-to-main" href="#main-content">
            {dict.header.skipToMain}
          </a>,
        ]}
      >
        <div className="d-flex align-items-center gap-3">
          {headerNavItems.length > 0 ? (
            <nav
              aria-label={dict.header.primaryNavAria}
              data-testid="primary-nav"
              className="d-none d-md-block"
            >
              <ul className="list-unstyled d-flex align-items-center gap-3 mb-0">
                {headerNavItems.map((item) => (
                  <li key={item.id}>
                    <Link href={item.href} className="text-decoration-underline">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div className="d-flex flex-shrink-0 align-items-center justify-content-end gap-3">
            {authActions()}
          </div>
        </div>
      </BCHeader>
      {showWorkspaces && workspacesLoaded && !hasWorkspaces && (
        <WorkspaceModal canCreateWorkspace={canCreateWorkspace} />
      )}
    </div>
  );
}

export { Header };
