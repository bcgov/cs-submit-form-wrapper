import type { AppPlugin } from '@/src/types/plugins';
import { FEATURE_CODES } from '@/src/shared/featureFlags/flags';

export const workspacesPlugin: AppPlugin = {
  id: 'workspaces',
  featureCode: FEATURE_CODES.WORKSPACES,
  showInHeaderNav: false,
  order: 10,
  getNavItem: ({ locale, dictionary }) => ({
    id: 'workspaces',
    href: `/${locale}/workspaces`,
    label: dictionary.header.workspaces,
  }),
};
