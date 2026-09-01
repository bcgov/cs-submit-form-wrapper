import Link from 'next/link';

/**
 * Root not-found boundary. Reached when `[lang]/layout.tsx` rejects a path whose first segment is
 * not a locale, so the locale is unknown here and the copy stays untranslated.
 */
export default function NotFound() {
  return (
    <main id="main-content" className="p-5" data-testid="not-found-page">
      <h1 className="h4">Page not found</h1>
      <p>The address you requested does not exist.</p>
      <p>
        <Link href="/">Go to the home page</Link>
      </p>
    </main>
  );
}
