import type { SWRConfiguration } from 'swr';
import { isSessionExpired } from './sobaFetch';

/**
 * App-wide SWR defaults. Mounted once by AppProviders; tests import the same object so they run
 * against the shipped behaviour.
 */
export const swrConfig: SWRConfiguration = {
  // A fresh cache per mount. The default cache is module-global and would outlive the store, which
  // AppProviders rebuilds on a locale change.
  provider: () => new Map(),
  // The token refreshes on its own schedule, so a refetch per tab switch buys nothing.
  revalidateOnFocus: false,
  // An ended session cannot be recovered by retrying, and every attempt costs a Keycloak round trip.
  shouldRetryOnError: (err: unknown) => !isSessionExpired(err),
  errorRetryCount: 2,
};

/**
 * Bootstrap reads. The route policy reads these, so an ambient refetch answering with an empty list
 * or an error would redirect a signed-in user mid-session. Re-read only through an explicit mutate.
 */
export const sessionReadConfig: SWRConfiguration = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
};
