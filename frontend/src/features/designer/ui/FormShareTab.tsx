'use client';
import { useCallback, useMemo } from 'react';
import { Heading, Button, Link } from '@bcgov/design-system-react-components';
import { useRouter, usePathname } from 'next/navigation';

import type { Dictionary } from '@/src/types/plugins';
import { useAppSelector } from '@/lib/store';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';

interface FormShareTabProps {
  dict: Dictionary;
}

export default function FormShareTab({ dict }: FormShareTabProps) {
  const { formId, formName, formDesc, formWorkspaceId } = useAppSelector((state) => state.form);
  const { workspaces } = useAppSelector((state) => state.workspace);
  const pathname = usePathname();
  const router = useRouter();
  const locale = getLocaleFromPath(pathname);
  const { addNotification } = useNotificationStore();

  const formWorkspace = useMemo(() => {
    return workspaces.find((w) => w.id === formWorkspaceId);
  }, [workspaces, formWorkspaceId]);

  const link = useMemo(() => {
    return `${window.location.origin}/${locale}/form/${formId}`;
  }, [locale, formId]);

  const copyToClipboard = useCallback(() => {
    addNotification({ text: dict.form.copiedNotification, type: 'success' });
    navigator.clipboard.writeText(link);
  }, [link, addNotification, dict.form.copiedNotification]);

  return (
    <>
      <Heading level={2} isUnstyled className="mt-5">
        {formName}
      </Heading>
      <p>{formDesc}</p>
      <p>
        {dict.form.ministryOrOrg}:{' '}
        {dict.ministries[formWorkspace?.org as keyof typeof dict.ministries] || 'Unknown'}
      </p>
      <p>
        <Button variant="secondary" onPress={copyToClipboard}>
          {dict.form.copy}
        </Button>
        <Link
          className="bcds-react-aria-Link medium false ms-2"
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
