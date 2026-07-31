'use client';

import { useParams, useRouter, usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Submission } from '@formio/react';
import type { FormType } from '@formio/react';
import { Subscription } from 'rxjs';
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
import { getSubmitFillBundle } from '@/src/shared/api/sobaApi';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useNotificationStore } from '@/lib/hooks/useNotificationStore';
import { useRxDb } from '@/src/app/providers/DbProviders';
import { useSubmissionDataReplication } from '@/lib/rxdb/replication';
import { deepEqual } from '@/src/shared/util/deepEqual';

type FillLabels = {
  loading: string;
  loadError: string;
  unavailable: string;
  rendererError: string;
  submitSuccess: string;
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
  // Tracks the last data Form.io gave us via onChange. Used to skip no-op saves: if Form.io
  // fires onChange with the same data it gave last time, we know nothing user-visible changed.
  // Updated eagerly (before the upsert) so the SSE feedback loop doesn't re-trigger a save.
  // Always deep-cloned before storing — Form.io mutates its submission object after onChange,
  // so a raw reference would become stale and break deepEqual comparisons.
  const lastSeenDataRef = useRef<Record<string, unknown> | null>(null);
  // Gates save logic: only start saving after Form.io has finished initializing. All onChange
  // events before onFormReady fires are mount-time normalization and should be ignored.
  const formReadyRef = useRef(false);
  // Tracks the raw data we last upserted into RxDB. When the SSE echo comes back with the
  // same data, the RxDB subscription detects it's our own save and skips the re-render that
  // would otherwise make Form.io fire onChange with re-processed data.
  const lastUpsertedDataRef = useRef<Record<string, unknown> | null>(null);

  const db = useRxDb();
  
  const formChangeRef = useRef<NodeJS.Timeout | null>(null);
  const isUnmountingRef = useRef(false);
  useSubmissionDataReplication();

  useEffect(() => {
    // Wait for auth to settle so an authenticated caller sends their token; anonymous proceeds with none.
    if (initializing || loadStartedRef.current) return;
    loadStartedRef.current = true;
    void (async () => {
      try {
        const authToken = token ?? undefined;
        // One call: workflow state + schema + any saved answers.
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

        // Populate the form directly from the server response. The RxDB document is created on
        // the first actual change (or remote update via SSE), so we don't insert here and trigger
        // an unnecessary push-replication save of unchanged data.
        const loadedData = (bundle.content?.data ?? {}) as Record<string, unknown>;
        setInitialData(loadedData);
        lastSeenDataRef.current = structuredClone(loadedData);
      } catch (err) {
        setLoadError(normalizeFormioRenderError(err, labels.loadError));
      }
    })();
  }, [initializing, token, submissionId, locale, router, labels.loadError, labels.unavailable]);

  // Subscribe to local RxDB for real-time collaboration updates.
  // When we save, the SSE echo upserts the same data back. Detect that and skip — otherwise
  // React re-renders, Form.io gets a new submission prop, re-processes the data, and fires
  // onChange with slightly different output, creating an infinite save loop.
  useEffect(() => {
    let sub: Subscription | undefined;
    if (db) {
      sub = db.submissionData.findOne(submissionId).$.subscribe((doc) => {
        if (doc) {
          const incoming = doc.data as Record<string, unknown>;
          if (lastUpsertedDataRef.current && deepEqual(lastUpsertedDataRef.current, incoming)) {
            return; // Our own save echoing back via SSE — skip to avoid re-render loop
          }
          // Realtime sync between browsers is disabled for now.
          // By skipping setInitialData here, Formio will not update when another browser changes the submission.
          /*
          setInitialData((prev) => {
            if (deepEqual(prev, incoming)) return prev;
            return incoming;
          });
          */
        }
      });
    }
    return () => {
      if (sub) sub.unsubscribe();
    };
  }, [db, submissionId]);

  // Expose the submission being filled to the CHEFS upload provider; clear it when leaving so a stale
  // id can't tag an unrelated upload (e.g. a designer preview).
  useEffect(() => {
    setActiveSubmissionId(submissionId);
    return () => clearActiveSubmissionId();
  }, [submissionId]);

  const submitForm = async (submission: Submission) => {
    // Cancel any pending draft save so it doesn't race with the submit and produce a 409.
    if (formChangeRef.current) clearTimeout(formChangeRef.current);
    try {
      if (db) {
        await db.submissionData.upsert({
          id: submissionId,
          data: (submission?.data ?? {}) as Record<string, unknown>,
          updatedAt: new Date().toISOString(),
          isDraft: false, // Triggers submit API via RxDB push
        });
      }
      addNotification({ text: labels.submitSuccess, type: 'success' });
      // Straight to the read-only confirmation; navigating away unmounts the form, so there's no
      // need to emit `submitDone` and no flash of Form.io's own success screen.
      router.push(`/${locale}/submission/${submissionId}`);
    } catch (err) {
      setRenderError(normalizeFormioRenderError(err, labels.rendererError));
      formInstanceRef.current?.emit('submitError', labels.rendererError);
    }
  };


  useEffect(() => {
    isUnmountingRef.current = false;
    return () => {
      isUnmountingRef.current = true;
      if (formChangeRef.current) clearTimeout(formChangeRef.current);
    };
  }, []);

  const handleFormChange = (submission: Submission) => {
    if (!formReadyRef.current || isUnmountingRef.current) return;
    if (formChangeRef.current) clearTimeout(formChangeRef.current);
    
    const snapshot = structuredClone(submission.data as Record<string, unknown>);
    
    // Form.io emits an empty data object (or just { submit: false }) when destroying the form instance on unmount.
    // If the snapshot looks like a destroy event and we previously had real data, ignore it so we don't wipe the DB.
    const isDestroyEvent = Object.keys(snapshot).length === 0 || (Object.keys(snapshot).length === 1 && snapshot.submit === false);
    if (isDestroyEvent && lastSeenDataRef.current && Object.keys(lastSeenDataRef.current).length > 1) {
      return;
    }

    formChangeRef.current = setTimeout(() => {
      if (db) {
        if (lastSeenDataRef.current && deepEqual(lastSeenDataRef.current, snapshot)) {
          return; // Form.io gave us the same data as last time — nothing changed
        }
        // Track what we're about to upsert so the RxDB subscription can recognise the SSE
        // echo and skip the re-render that would restart the loop.
        lastUpsertedDataRef.current = snapshot;
        lastSeenDataRef.current = snapshot;
        db.submissionData.upsert({
          id: submissionId,
          data: snapshot,
          updatedAt: new Date().toISOString(),
          isDraft: true, // Triggers save draft API via RxDB push
        });
      }
    }, 1000); // 1s debounce
  };

  const submissionProp = useMemo(() => ({ data: initialData as Submission['data'] }), [initialData]);
  const optionsProp = useMemo(() => ({ noAlerts: true, ...bcgovFileOption }), [bcgovFileOption]);

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
            // We own all submit messaging (success toast + redirect, inline error), so suppress
            // Form.io's built-in green "Submission Complete" alert.
            options={optionsProp}
            onFormReady={(instance) => {
              formInstanceRef.current = instance;
              formReadyRef.current = true;

              if (instance?.data) {
                lastSeenDataRef.current = instance.data as Record<string, unknown>;
              }
            }}
            onError={(err) => {
              setRenderError(normalizeFormioRenderError(err, labels.loadError));
            }}
            onChange={handleFormChange}
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
        }}
      />
    </div>
  );
}
