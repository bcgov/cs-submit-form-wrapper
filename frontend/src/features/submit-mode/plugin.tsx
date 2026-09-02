import type { AppPlugin } from '@/src/types/plugins';
import { FEATURE_CODES } from '@/src/shared/featureFlags/flags';
import { navLink } from '@/src/shared/list/listQueryMemory';

export const submitModePlugin: AppPlugin = {
  id: 'submit-mode',
  featureCode: FEATURE_CODES.SUBMIT_MODE,
  showInHeaderNav: false,
  order: 30,
  getNavItem: ({ locale, dictionary }) => ({
    id: 'submit-mode',
    href: navLink(`/${locale}/forms`),
    label: dictionary.header.submit,
  }),
};
