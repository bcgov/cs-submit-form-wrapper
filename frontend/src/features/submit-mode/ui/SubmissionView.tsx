'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormType, Submission } from '@formio/react';
import { InlineAlert } from '@bcgov/design-system-react-components';
import { CenteredProgress } from '@/app/ui/base/CenteredProgress';
import { useKeycloak } from '@/lib/hooks/useKeycloak';
import { useDictionary } from '@/app/[lang]/Providers';
import { ReadOnlyFormView } from '@/src/features/formio-v5/ui/ReadOnlyFormView';
import { WorkflowStateBadge } from './WorkflowStateBadge';
import { useFormatLongDate } from '@/src/shared/hooks/useFormatLongDate';
import {
  getSubmitSubmission,
  getSubmitSubmissionSchema,
  getSubmitSubmissionData,
} from '@/src/shared/api/sobaApi';
import type { SubmissionListItem } from '@/src/types/submissions';
import { isSessionExpired } from '@/src/shared/api/sobaFetch';
import { convertSubmissionIdToConfirmationId } from '@/src/shared/util/stringUtils';

export function SubmissionView() {
  const params = useParams();
  const dict = useDictionary();
  const dictSub = dict.submission;
  // Token optional: a public submitter can view a submission on a public-audience form.
  const { token, initializing } = useKeycloak();
  const formatLongDate = useFormatLongDate();

  const submissionIdRaw = params?.submissionId;
  const submissionId =
    typeof submissionIdRaw === 'string' ? decodeURIComponent(submissionIdRaw) : '';

  const confirmationId = convertSubmissionIdToConfirmationId(submissionId);

  const [submission, setSubmission] = useState<SubmissionListItem | null>(null);
  const [schema, setSchema] = useState<FormType | null>(null);
  // null = no engine document (submission has no saved answers); {} = empty answers on a real doc.
  const [content, setContent] = useState<{ data?: Record<string, unknown> } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Guard the load with a ref (not the `loaded` state) so StrictMode's dev double-invoke fetches once.
  const loadStartedRef = useRef(false);

  useEffect(() => {
    // Wait for auth to settle so a signed-in caller sends their token; anonymous proceeds with none.
    if (initializing || loadStartedRef.current) return;
    loadStartedRef.current = true;
    void (async () => {
      try {
        // The confirmation view is submit-mode: read through the submit APIs regardless of sign-in so
        // audience members who aren't workspace members can still view. Token passed when present.
        const authToken = token ?? undefined;
        const sub = await getSubmitSubmission(authToken, submissionId);
        setSubmission(sub);
        const [loadedSchema, fetchedContent] = await Promise.all([
          getSubmitSubmissionSchema(authToken, submissionId),
          getSubmitSubmissionData(authToken, submissionId),
        ]);
        if (loadedSchema) setSchema(loadedSchema);
        setContent(fetchedContent);
      } catch (err) {
        // An ended session is not a missing submission; saying "not found" hides why.
        if (isSessionExpired(err)) setSessionEnded(true);
        else setNotFound(true);
      } finally {
        setLoaded(true);
      }
    })();
  }, [initializing, token, submissionId]);

  if (initializing) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  const renderContent = () => {
    if (!loaded) {
      return <CenteredProgress label={dictSub?.loading || dict.general.loading} />;
    }
    if (sessionEnded) {
      return (
        <InlineAlert variant="danger" role="alert" data-testid="submission-view-session-expired">
          {dict.general.sessionExpired}
        </InlineAlert>
      );
    }
    if (notFound || !submission) {
      return (
        <InlineAlert variant="danger" role="alert" data-testid="submission-view-notfound">
          {dictSub?.notFound || 'Submission not found.'}
        </InlineAlert>
      );
    }
    return (
      <>
        <div className="mb-3" data-testid="submission-view-header">
          <h3 className="h5 mb-1">{submission.formName || dict.form?.nameLabel || 'Submission'}</h3>
          <div>
            {dict.submission.confirmationId}: {confirmationId}
          </div>
          <div className="small text-muted">
            <span data-testid="submission-view-version">v{submission.versionNo ?? 1}</span>
            {' · '}
            <WorkflowStateBadge
              state={submission.workflowState}
              data-testid="submission-view-status"
            />
            {submission.submittedAt ? (
              <>
                {' · '}
                <span data-testid="submission-view-submitted">
                  {dictSub?.submittedOn || 'Submitted'} {formatLongDate(submission.submittedAt)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {schema && content !== null ? (
          <ReadOnlyFormView
            schema={schema}
            submission={{ data: (content.data ?? {}) as Submission['data'] }}
            testId="submission-view-form"
          />
        ) : (
          <InlineAlert variant="info" role="alert" data-testid="submission-view-nocontent">
            {dictSub?.noContent || 'No submitted answers to display.'}
          </InlineAlert>
        )}
      </>
    );
  };

  return (
    <div className="mt-3" data-testid="submission-view">
      {renderContent()}
    </div>
  );
}
