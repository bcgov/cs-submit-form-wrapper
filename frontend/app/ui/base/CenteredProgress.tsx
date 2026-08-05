'use client';

import { ProgressCircle } from '@bcgov/design-system-react-components';

type CenteredProgressProps = {
  /**
   * Screen-reader-only label for the spinner. There is no visible loading text
   * by design, so this is the only thing assistive tech announces — keep it
   * meaningful (e.g. the localized "Loading…").
   */
  label?: string;
  /** Optional minimum height so the spinner can center within a tall empty area. */
  minHeight?: string;
  'data-testid'?: string;
};

import { useClientMounted } from '@/lib/hooks/useClientMounted';

/**
 * The single loading indicator for the app: a horizontally/vertically centered
 * ProgressCircle with no visible text. Use everywhere a screen, page data area,
 * or table body is pending so loading looks and behaves the same throughout.
 *
 * Accessibility: the wrapper is a `role="status"` live region (implicit
 * `aria-live="polite"`) so screen readers announce the spinner when it appears,
 * and the ProgressCircle carries an `aria-label` as its accessible name.
 */
export function CenteredProgress({
  label = 'Loading',
  minHeight,
  'data-testid': testId = 'loading-indicator',
}: CenteredProgressProps) {
  const isMounted = useClientMounted();

  return (
    <div
      role="status"
      className="d-flex justify-content-center align-items-center p-5"
      style={minHeight ? { minHeight } : undefined}
      data-testid={testId}
    >
      {isMounted && <ProgressCircle isIndeterminate aria-label={label} />}
    </div>
  );
}
