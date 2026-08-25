'use client';
import { useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Dropdown } from 'react-bootstrap';
import { Header as BCHeader } from '@bcgov/design-system-react-components';
import { FaUser } from 'react-icons/fa6';
import { useAppDispatch } from '@/lib/store';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { clearCurrentUser, loadCurrentUser } from '@/lib/slices/currentUserSlice';
import { loadWorkspaces } from '@/lib/slices/workspaceSlice';
import { useAppSelector } from '@/lib/store';
import { useDictionary } from '../[lang]/Providers';
import { LoginButton } from './LoginButton';
import { LanguageSelector, type LanguageOption } from './LanguageSelector';
import type { PluginNavItem } from '@/src/types/plugins';
import { WorkspaceModal } from '@/src/components/WorkspaceModal';

import styles from './Header.module.css';

type HeaderProps = {
  headerNavItems: PluginNavItem[];
  overlayNavItems: PluginNavItem[];
  showWorkspaces: boolean;
};

function Header({ headerNavItems, showWorkspaces }: Readonly<HeaderProps>) {
  const dispatch = useAppDispatch();
  const dict = useDictionary();
  const locale = dict.locale === 'en' || dict.locale === 'fr' ? dict.locale : 'en';
  const languageOptions: LanguageOption[] = Object.entries(dict.header.languages).map(
    ([value, label]) => ({ value, label }),
  );
  const pathname = usePathname();
  const router = useRouter();
  const { authenticated, idTokenParsed, token, logout, init, refresh } = useKeycloak();
  const currentUser = useCurrentUser();
  const {
    workspaces,
    status: workspaceStatus,
    canceledDefaultModal,
  } = useAppSelector((state) => state.workspace);

  const headerChromeRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const { data: currentStateUser } = useAppSelector((state) => state.currentUser);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!authenticated || !token) {
      if (intervalRef) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
      dispatch(clearCurrentUser());
      return;
    }
    // Keyed on load state, not on the token: a rotation mints a new token for the same user, and
    // re-reading /me for it flips the session out of 'ready' and unmounts whatever is on screen.
    if (currentUser.status === 'idle') {
      dispatch(loadCurrentUser(token));
    }

    if (authenticated && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        refresh();
      }, 30000);
    }
  }, [authenticated, token, currentUser.status, dispatch, refresh]);

  useEffect(() => {
    if (authenticated && token && workspaceStatus === 'idle') {
      dispatch(loadWorkspaces(token));
    }
  }, [authenticated, token, workspaceStatus, dispatch]);

  const hasWorkspaces = useMemo(() => workspaces.length > 0, [workspaces.length]);
  const canCreateWorkspace = currentStateUser?.capabilities?.canCreateWorkspace === true;

  const handleLogout = () => {
    dispatch(clearCurrentUser());
    logout();
  };

  const handleLanguageChange = (newLocale: string) => {
    if (pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`) {
      const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
      router.push(newPath);
    } else {
      router.push(`/${newLocale}/`);
    }
  };

  const authActions = () => {
    // The slice is cleared on sign-out, so anything loaded belongs to the current session. Matching
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
    } else if (currentUser.isLoaded) {
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
      {showWorkspaces && workspaceStatus === 'succeeded' && !hasWorkspaces && !canceledDefaultModal && (
        <WorkspaceModal canCreateWorkspace={canCreateWorkspace} />
      )}
    </div>
  );
}

export { Header };
