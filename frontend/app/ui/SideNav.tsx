'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@bcgov/design-system-react-components';
import { usePathname } from 'next/navigation';
import { useDictionary } from '../[lang]/Providers';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import {
  FaRegMessage,
  FaRegCircleQuestion,
  FaHouse,
  FaList,
  FaChevronRight,
  FaChevronLeft,
  FaUserShield,
} from 'react-icons/fa6';
import { useIsSobaAdmin } from '@/src/features/admin/useIsSobaAdmin';
import styles from './SideNav.module.css';

interface SideNavProps {
  showAppLinks: boolean;
  showHome: boolean;
  showWorkspaces: boolean;
}

export function SideNav({ showAppLinks, showHome, showWorkspaces }: Readonly<SideNavProps>) {
  const { authenticated } = useKeycloak();
  const { isSobaAdmin } = useIsSobaAdmin();
  const dict = useDictionary();
  const pathname = usePathname();
  const locale = dict.locale === 'en' || dict.locale === 'fr' ? dict.locale : 'en';
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [];
  if (showHome) {
    navItems.push({
      href: authenticated ? `/${locale}/forms` : `/`,
      title: authenticated ? dict.general.forms : dict.general.home,
      testId: 'home-nav',
      icon: <FaHouse className={styles.iconOutlineBootstrap} size={20} />,
      isActive: authenticated
        ? pathname === `/${locale}/forms`
        : pathname === `/${locale}` || pathname === `/`,
    });
  }

  if (showWorkspaces && authenticated) {
    navItems.push({
      href: `/${locale}/workspaces`,
      title: dict.header.workspaces,
      testId: 'workspaces-nav',
      icon: <FaList size={20} />,
      isActive:
        pathname.startsWith(`/${locale}/workspaces`) ||
        pathname === `/${locale}/workspace` ||
        pathname.startsWith(`/${locale}/workspace/`),
    });
  }

  if (authenticated && isSobaAdmin) {
    navItems.push({
      href: `/${locale}/admin`,
      title: dict.admin.heading,
      testId: 'admin-nav',
      icon: <FaUserShield size={20} />,
      isActive: pathname.startsWith(`/${locale}/admin`),
    });
  }

  if (showAppLinks) {
    navItems.push(
      {
        href: `/${locale}/feedback`,
        title: dict.general.feedback,
        testId: 'feedback-nav',
        icon: <FaRegMessage size={20} />,
        isActive: pathname.startsWith(`/${locale}/feedback`),
      },
      {
        href: `/${locale}/help`,
        title: dict.general.help,
        testId: 'help-nav',
        icon: <FaRegCircleQuestion size={20} />,
        isActive: pathname.startsWith(`/${locale}/help`),
      },
    );
  }

  return (
    <nav className={`d-flex flex-column py-3 px-2 ${styles.sideNav}`}>
      <ul id="sidenav-items" className="nav flex-column gap-2">
        {navItems.map((item) => (
          <li className="nav-item" key={item.href}>
            <Link
              href={item.href}
              data-testid={item.testId}
              className={`nav-link d-flex align-items-center gap-3 px-3 py-2 text-decoration-none rounded text-dark ${
                styles.navLink
              } ${item.isActive ? styles.navActive : ''}`}
              title={item.title}
            >
              <div className={styles.navIcon}>{item.icon}</div>
              {!isCollapsed && <span className="d-none d-md-block fw-medium">{item.title}</span>}
            </Link>
          </li>
        ))}
      </ul>

      {/* The wrapper carries the position. A className on the Button replaces the design system's
          own classes rather than adding to them, so its styling is overridden from the wrapper. */}
      <span className={styles.toggleSlot}>
        <Button
          id="sidebar-toggle-button"
          variant="secondary"
          size="small"
          isIconButton
          aria-label={dict.sideNav.toggleSidebar}
          aria-expanded={!isCollapsed}
          aria-controls="sidenav-items"
          data-testid="sidebar-toggle"
          onPress={() => {
            setIsCollapsed(!isCollapsed);
          }}
        >
          {isCollapsed ? <FaChevronRight size={14} /> : <FaChevronLeft size={14} />}
        </Button>
      </span>
    </nav>
  );
}
