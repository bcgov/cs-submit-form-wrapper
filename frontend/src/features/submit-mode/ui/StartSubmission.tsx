'use client';

import { useParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { InlineAlert } from '@bcgov/design-system-react-components';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { useDictionary } from '@/app/[lang]/Providers';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { normalizeFormioRenderError } from '@/src/features/formio-v5/normalizeFormioRenderError';
import { openSobaFormSubmission } from '@/src/shared/api/sobaApi';
import { useKeycloak } from '@/lib/hooks/useKeycloak';

type StartLabels = {
  starting: string;
  startError: string;
};

/**
 * Start action for filling a form, reached by navigating to /form/[formId] (the Forms-table "Submit"
 * action, or a pasted link). It opens a submission for the form's published version, then redirects to
 * the fill page addressed by the new submission id. It renders nothing but a spinner — creating the
 * record is the whole job; rendering the form is the fill page's.
 *
 * Every visit opens a new submission (that's the intent of the URL). It runs in a client effect, so
 * Next's <Link> prefetch — which renders the RSC but not client effects — never spawns a stray record.
 */
function StartSubmissionBody({ formId, labels }: Readonly<{ formId: string; labels: StartLabels }>) {
  // Token is optional: a public-audience form can be started without signing in.
  const { token, initializing } = useKeycloak();
  const router = useRouter();
  const locale = getLocaleFromPath(usePathname());

  const [error, setError] = useState<string | null>(null);
  // Fire the open exactly once per mount, even if token/deps settle in stages.
  const startedRef = useRef(false);

  useEffect(() => {
    // Wait for auth to settle so a signed-in caller sends their token; anonymous proceeds with none.
    // Fire exactly once (startedRef) and run to completion — deliberately no unmount/active guard:
    // StrictMode's dev remount would otherwise cancel the only in-flight open and strand the spinner.
    if (initializing || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      try {
        const created = await openSobaFormSubmission(token ?? undefined, formId);
        // replace, not push: the start URL shouldn't sit in history and re-open on Back.
        router.replace(`/${locale}/submit/${created.id}`);
      } catch (err) {
        setError(normalizeFormioRenderError(err, labels.startError));
      }
    })();
  }, [initializing, token, formId, locale, router, labels.startError]);

  if (error) {
    return (
      <InlineAlert variant="danger" role="alert" data-testid="start-submission-error">
        {error}
      </InlineAlert>
    );
  }

  return <CenteredProgress label={labels.starting} />;
}

export default function StartSubmission() {
  const params = useParams();
  const raw = params?.formId;
  const formId = typeof raw === 'string' ? decodeURIComponent(raw) : '';
  const dict = useDictionary();
  const labels = dict.formioV5.formRender;

  if (!formId) {
    return (
      <InlineAlert variant="danger" role="alert">
        {labels.missingId}
      </InlineAlert>
    );
  }

  return (
    <StartSubmissionBody
      formId={formId}
      labels={{
        starting: labels.starting,
        startError: labels.startError,
      }}
    />
  );
}
