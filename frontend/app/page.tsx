import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

function parsePreferredLocale(acceptLang?: string | null) {
  if (!acceptLang) return 'en';
  // acceptLang example: "fr-CA,fr;q=0.9,en;q=0.8"
  const parts = acceptLang.split(',').map((p) => p.split(';')[0].trim());
  for (const p of parts) {
    if (p.startsWith('fr')) return 'fr';
    if (p.startsWith('en')) return 'en';
  }
  return 'en';
}

export default async function Page() {
  const hdrs = await headers();
  const accept = hdrs.get('accept-language');
  const locale = parsePreferredLocale(accept);
  // Redirect to the localized route (e.g. /en or /fr)
  redirect(`/${locale}`);
}
