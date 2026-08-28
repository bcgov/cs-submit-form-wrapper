'use client';

import { useParams } from 'next/navigation';
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
import { isSessionExpired } from '@/src/shared/api/sobaFetch';
import { useMaybeAuthedSWR } from '@/src/shared/api/useAuthedSWR';

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

  const { data, isLoading, error } = useMaybeAuthedSWR(
    // Wait for auth to settle so a signed-in caller sends their token; anonymous proceeds with none.
    // The identity is part of the key so signing in does not read the anonymous reader's copy.
    initializing || !submissionId
      ? null
      : ['submit-submission', submissionId, token ? 'user' : 'anonymous'],
    async (authToken) => {
      // The confirmation view is submit-mode: read through the submit APIs regardless of sign-in so
      // audience members who aren't workspace members can still view.
      const submission = await getSubmitSubmission(authToken, submissionId);
      const [schema, content] = await Promise.all([
        getSubmitSubmissionSchema(authToken, submissionId),
        getSubmitSubmissionData(authToken, submissionId),
      ]);
      return { submission, schema: (schema as FormType) ?? null, content };
    },
  );

  const submission = data?.submission ?? null;
  const schema = data?.schema ?? null;
  // null = no engine document (submission has no saved answers); {} = empty answers on a real doc.
  const content = data?.content ?? null;
  // An ended session is not a missing submission; saying "not found" hides why.
  const sessionEnded = !!error && isSessionExpired(error);
  const notFound = !!error && !sessionEnded;

  if (initializing) {
    return <CenteredProgress label={dict.general.loading} />;
  }

  const renderContent = () => {
    if (isLoading) {
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
