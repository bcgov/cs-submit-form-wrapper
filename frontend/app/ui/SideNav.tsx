'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@bcgov/design-system-react-components';
import { useDictionary } from '../[lang]/Providers';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import {
  FaRegMessage,
  FaRegCircleQuestion,
  FaHouse,
  FaList,
  FaChevronRight,
  FaChevronLeft,
} from 'react-icons/fa6';
import styles from './SideNav.module.css';

interface SideNavProps {
  showAppLinks: boolean;
  showHome: boolean;
}

export function SideNav({ showAppLinks, showHome }: SideNavProps) {
  const { authenticated } = useKeycloak();
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

  if (showAppLinks && authenticated) {
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
    <nav className={`d-flex flex-column py-3 px-2 ${styles.sideNav} position-relative`}>
      <ul className="nav flex-column gap-2">
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

      <Button
        id="sidebar-toggle-button"
        className={`position-relative top-25 start-100 translate-middle-y bg-white border border-start-0 rounded-end d-flex align-items-center justify-content-center shadow-sm p-0 ${styles.sidebarToggle}`}
        aria-label="Toggle Sidebar"
        variant="secondary"
        data-testid="sidebar-toggle"
        onClick={() => {
          // Add your state toggle logic here
          setIsCollapsed(!isCollapsed);
        }}
      >
        {isCollapsed ? (
          <FaChevronRight size={14} className="text-secondary" />
        ) : (
          <FaChevronLeft size={14} className="text-secondary" />
        )}
      </Button>
    </nav>
  );
}
