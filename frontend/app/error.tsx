'use client';

/**
 * Error boundary for everything under the root layout, including `[lang]/layout.tsx` itself. A
 * segment boundary cannot catch a throw from its own layout, so the backend bootstrap failures
 * raised there (features meta, dictionaries) land here.
 *
 * The locale is unknown at this level, so the copy stays untranslated. Route-level boundaries that
 * can reach the dictionary belong closer to the page, as in `[lang]/form/[formId]/error.tsx`.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main-content" className="p-5" data-testid="app-error-page">
      <h1 className="h4">This service is temporarily unavailable</h1>
      <p>The application could not reach a service it needs to start. Try again in a moment.</p>
      <p>
        <button type="button" onClick={reset} data-testid="app-error-retry">
          Try again
        </button>
      </p>
      {error.digest ? <p className="small text-muted">Reference: {error.digest}</p> : null}
    </main>
  );
}
