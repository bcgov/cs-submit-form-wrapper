'use client';

import { StatusTag, workflowStateToVariant } from '@/src/components/StatusTag';

type WorkflowStateBadgeProps = {
  state?: string;
  'data-testid'?: string;
};

/**
 * The submission workflow-state pill, shared by the submissions list and the
 * single-submission viewer so the status looks identical in both places.
 */
export function WorkflowStateBadge({ state, 'data-testid': testId }: WorkflowStateBadgeProps) {
  const label = (state || '').toUpperCase();
  return (
    <StatusTag
      label={label}
      variant={workflowStateToVariant(state)}
      data-testid={testId}
    />
  );
}
