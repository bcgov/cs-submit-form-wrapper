import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { useSWRConfig } from 'swr';

vi.mock('@/app/ui/base/NotificationToast', () => ({ NotificationToast: () => null }));

import AppProviders from '@/src/app/providers/AppProviders';
import { sessionReadConfig } from '@/src/shared/api/swrConfig';
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

const seenCaches: unknown[] = [];

function CacheProbe() {
  seenCaches.push(useSWRConfig().cache);
  return null;
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

  // SWR's default cache is module-global and would outlive the store, which is rebuilt when the
  // localized layout remounts. The next mount would then read the previous one's data.
  it('gives each mount its own cache', async () => {
    seenCaches.length = 0;
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        render(
          <AppProviders dictionary={{ locale: 'en' } as Dictionary} locale="en">
            <CacheProbe />
          </AppProviders>,
        );
      });
    }

    expect(seenCaches).toHaveLength(2);
    expect(seenCaches[0]).not.toBe(seenCaches[1]);
  });

  // The reads the route policy depends on opt out of ambient revalidation. Turning one of these
  // back on lets a refetch answer mid-session and move a signed-in user off the page they are on.
  it('keeps ambient revalidation off for the bootstrap reads', () => {
    expect(sessionReadConfig.revalidateIfStale).toBe(false);
    expect(sessionReadConfig.revalidateOnFocus).toBe(false);
    expect(sessionReadConfig.revalidateOnReconnect).toBe(false);
  });
});
