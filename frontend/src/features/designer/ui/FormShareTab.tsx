'use client';
import { useCallback, useMemo } from 'react';
import { Heading, Button, Link } from '@bcgov/design-system-react-components';
import { useRouter, usePathname } from 'next/navigation';

import type { Dictionary } from '@/src/types/plugins';
import { useWorkspaces } from '@/src/shared/api/useWorkspaces';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { getFormsAppBaseUrl } from '@/src/shared/config/runtimeConfig';

interface FormShareTabProps {
  dict: Dictionary;
  formId?: string;
  formName: string;
  formDesc: string;
  workspaceId: string | null;
}

export default function FormShareTab({
  dict,
  formId,
  formName,
  formDesc,
  workspaceId,
}: Readonly<FormShareTabProps>) {
  const { workspaces } = useWorkspaces();
  const pathname = usePathname();
  const router = useRouter();
  const locale = getLocaleFromPath(pathname);
  const { addNotification } = useNotificationStore();

  const formWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === workspaceId);
  }, [workspaces, workspaceId]);

  const link = useMemo(() => {
    return `${getFormsAppBaseUrl()}/${locale}/form/${formId}`;
  }, [locale, formId]);

  const copyToClipboard = useCallback(() => {
    addNotification({ text: dict.form.copiedNotification, type: 'success' });
    navigator.clipboard.writeText(link);
  }, [link, addNotification, dict.form.copiedNotification]);

  return (
    <>
      <Heading level={2} isUnstyled className="mt-5" data-testid="share-tab-formName">
        {formName}
      </Heading>
      <p data-testid="share-tab-formDesc">{formDesc}</p>
      <p data-testid="share-tab-ministryOrOrg">
        {dict.form.ministryOrOrg}:{' '}
        {dict.ministries[formWorkspace?.org as keyof typeof dict.ministries] || 'Unknown'}
      </p>
      <p>
        <Button variant="secondary" data-testid="share-tab-copyToClip" onPress={copyToClipboard}>
          {dict.form.copy}
        </Button>
        <Link
          className="bcds-react-aria-Link medium false ms-2"
          data-testid="share-tab-form-link"
          onPress={() => {
            router.push(link);
          }}
        >
          {link}
        </Link>
      </p>
    </>
  );
}
