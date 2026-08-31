'use client';

import { useParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Submission } from '@formio/react';
import type { FormType } from '@formio/react';
import { InlineAlert } from '@bcgov/design-system-react-components';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { useDictionary } from '@/app/[lang]/Providers';
import { getLocaleFromPath } from '@/src/shared/util/locale';
import { normalizeFormioRenderError } from '@/src/features/formio-v5/normalizeFormioRenderError';
import { FormioV5FormRenderErrorBoundary } from '@/src/features/formio-v5/ui/FormioV5FormRenderErrorBoundary';
import { DynamicForm } from '@/src/features/formio-v5/ui/DynamicForm';
import { useBcgovFileOption } from '@/src/features/formio-v5/useBcgovFileOption';
import {
  setActiveSubmissionId,
  clearActiveSubmissionId,
} from '@/src/features/formio-v5/activeSubmission';
import { getSubmitFillBundle, submitSobaFormSubmission } from '@/src/shared/api/sobaApi';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';

type FillLabels = {
  loading: string;
  loadError: string;
  unavailable: string;
  rendererError: string;
  submitSuccess: string;
  sessionExpired: string;
};

/**
 * Renders an already-opened submission for filling, keyed on its id. The submission record exists
 * before this mounts (opened in the start step), so this component only renders + submits — it never
 * creates. Loads the submission's own version schema and any saved answers, so a refresh resumes.
 */
function SubmissionFillBody({
  submissionId,
  labels,
}: Readonly<{
  submissionId: string;
  labels: FillLabels;
}>) {
  // Token is optional: a public-audience submission is fillable without signing in.
  const { token, initializing } = useKeycloak();
  const { addNotification } = useNotificationStore();
  const router = useRouter();
  const locale = getLocaleFromPath(usePathname());

  const [schema, setSchema] = useState<FormType | null>(null);
  const [initialData, setInitialData] = useState<Record<string, unknown>>({});
  // Host file constraints (blocked extensions + max size) for the BCGovFile component; {} when files off.
  const bcgovFileOption = useBcgovFileOption();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  // Load the bundle once. A ref (not state) guard dedupes StrictMode's dev double-invoke, so /fill
  // isn't fetched twice; no unmount/active flag, so the one in-flight load always applies its result.
  const loadStartedRef = useRef(false);
  // The Form.io webform instance; in JSON mode (no `src`) we must signal it on a failed submit,
  // or its submit button spins forever. On success we navigate away instead.
  const formInstanceRef = useRef<{
    emit: (event: string, ...args: unknown[]) => void;
  } | null>(null);

  useEffect(() => {
    // Wait for auth to settle so an authenticated caller sends their token; anonymous proceeds with none.
    if (initializing || loadStartedRef.current) return;
    loadStartedRef.current = true;
    void (async () => {
      try {
        const authToken = token ?? undefined;
        // One call: workflow state + schema + any saved answers. `content` is null for a just-opened
        // submission, so there's no separate (404-ing) data fetch.
        const bundle = await getSubmitFillBundle(authToken, submissionId);
        // An already-submitted submission isn't fillable; send them to its confirmation.
        if (bundle.workflowState === 'submitted') {
          router.replace(`/${locale}/submission/${submissionId}`);
          return;
        }
        if (!bundle.schema) {
          setLoadError(labels.unavailable);
          return;
        }
        setSchema(bundle.schema as FormType);
        // Resume: prefill with any saved answers (a just-opened submission has none).
        setInitialData((bundle.content?.data ?? {}) as Record<string, unknown>);
      } catch (err) {
        setLoadError(normalizeFormioRenderError(err, labels.loadError, labels.sessionExpired));
      }
    })();
  }, [
    initializing,
    token,
    submissionId,
    locale,
    router,
    labels.loadError,
    labels.unavailable,
    labels.sessionExpired,
  ]);

  // Expose the submission being filled to the CHEFS upload provider; clear it when leaving so a stale
  // id can't tag an unrelated upload (e.g. a designer preview).
  useEffect(() => {
    setActiveSubmissionId(submissionId);
    return () => clearActiveSubmissionId();
  }, [submissionId]);

  // Form.io resets the live webform when the submission prop isn't deep-equal to what the user has
  // typed, and a token refresh re-renders this — a fresh literal would discard answers in progress.
  const submissionProp = useMemo(
    () => ({ data: initialData as Submission['data'] }),
    [initialData],
  );
  // We own all submit messaging (success toast + redirect, inline error), so suppress Form.io's
  // built-in green "Submission Complete" alert.
  const formOptions = useMemo(() => ({ noAlerts: true, ...bcgovFileOption }), [bcgovFileOption]);

  const submitForm = async (submission: Submission) => {
    try {
      await submitSobaFormSubmission(
        token ?? undefined,
        submissionId,
        (submission?.data ?? {}) as Record<string, unknown>,
      );
      addNotification({ text: labels.submitSuccess, type: 'success' });
      // Straight to the read-only confirmation; navigating away unmounts the form, so there's no
      // need to emit `submitDone` and no flash of Form.io's own success screen.
      router.push(`/${locale}/submission/${submissionId}`);
    } catch (err) {
      setRenderError(normalizeFormioRenderError(err, labels.rendererError, labels.sessionExpired));
      formInstanceRef.current?.emit('submitError', labels.rendererError);
    }
  };

  if (loadError) {
    return (
      <InlineAlert variant="danger" role="alert" data-testid="submission-fill-error">
        {loadError}
      </InlineAlert>
    );
  }

  if (!schema) {
    return <CenteredProgress label={labels.loading} />;
  }

  return (
    <>
      {renderError ? (
        <InlineAlert variant="danger" role="alert" data-testid="submission-fill-render-error">
          {renderError}
        </InlineAlert>
      ) : null}
      <FormioV5FormRenderErrorBoundary
        fallback={
          <InlineAlert variant="danger" role="alert">
            {labels.rendererError}
          </InlineAlert>
        }
      >
        <div className="formio-v5-chrome" data-soba-formio-chrome data-testid="submission-fill">
          <DynamicForm
            className="formio-v5-form-root"
            src=""
            form={schema}
            submission={submissionProp}
            options={formOptions}
            onFormReady={(instance) => {
              formInstanceRef.current = instance;
            }}
            onError={(err) => {
              setRenderError(
                normalizeFormioRenderError(err, labels.loadError, labels.sessionExpired),
              );
            }}
            onSubmit={submitForm}
          />
        </div>
      </FormioV5FormRenderErrorBoundary>
    </>
  );
}

export default function FormioV5SubmissionFillClient() {
  const params = useParams();
  const raw = params?.submissionId;
  const submissionId = typeof raw === 'string' ? decodeURIComponent(raw) : '';
  const dict = useDictionary();
  const labels = dict.formioV5.formRender;

  if (!submissionId) {
    return (
      <InlineAlert variant="danger" role="alert">
        {labels.missingId}
      </InlineAlert>
    );
  }

  return (
    <div className="mt-3">
      <SubmissionFillBody
        key={submissionId}
        submissionId={submissionId}
        labels={{
          loading: dict.form?.loading || 'Loading…',
          loadError: labels.loadError,
          unavailable: labels.unavailable,
          rendererError: labels.rendererError,
          submitSuccess: labels.submitSuccess,
          sessionExpired: dict.general.sessionExpired,
        }}
      />
    </div>
  );
}
