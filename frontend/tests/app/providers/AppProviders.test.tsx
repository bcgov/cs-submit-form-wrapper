import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { useSWRConfig } from 'swr';

vi.mock('@/app/ui/base/NotificationToast', () => ({ NotificationToast: () => null }));

import AppProviders from '@/src/app/providers/AppProviders';
import { SessionExpiredError } from '@/src/shared/api/sobaFetch';

type Dictionary = React.ComponentProps<typeof AppProviders>['dictionary'];

function ConfigProbe() {
  const config = useSWRConfig();
  const retryOnExpired = (config.shouldRetryOnError as unknown as (err: unknown) => boolean)(
    new SessionExpiredError(),
  );
  return (
    <span
      data-testid="probe"
      data-focus={String(config.revalidateOnFocus)}
      data-retries={String(config.errorRetryCount)}
      data-retry-expired={String(retryOnExpired)}
    />
  );
}

describe('AppProviders', () => {
  // Nothing else in the suite renders AppProviders, so a dropped SWRConfig goes unnoticed.
  it('mounts the app SWR defaults', async () => {
    await act(async () => {
      render(
        <AppProviders dictionary={{ locale: 'en' } as Dictionary} locale="en">
          <ConfigProbe />
        </AppProviders>,
      );
    });

    const probe = screen.getByTestId('probe');
    expect(probe).toHaveAttribute('data-focus', 'false');
    expect(probe).toHaveAttribute('data-retries', '2');
    expect(probe).toHaveAttribute('data-retry-expired', 'false');
  });
});
