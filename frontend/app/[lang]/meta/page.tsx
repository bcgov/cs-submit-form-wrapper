import { notFound } from 'next/navigation';
import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { createIsFeatureAllowed, FEATURE_CODES } from '@/src/shared/featureFlags/flags';
import { PageLayout } from '@/src/components/PageLayout';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Feature support | SOBA',
};

const cell = { border: '1px solid #ccc', padding: '4px 10px', textAlign: 'left' } as const;

// Diagnostic page — type /{locale}/meta in the browser. Shows which features this frontend
// surfaces (its allowlist ∩ the platform-enabled features). Gated on the `meta` code so it can
// be switched off per deployment; intentionally not in any nav.
export default async function MetaPage() {
  const featuresMeta = await loadFeaturesMeta();
  const isFeatureAllowed = createIsFeatureAllowed(featuresMeta);
  if (!isFeatureAllowed(FEATURE_CODES.META)) {
    notFound();
  }

  const allowlist = process.env.NEXT_PUBLIC_SOBA_FEATURES_ALLOWED ?? '';
  const rows = [...featuresMeta.features].sort((a, b) => a.code.localeCompare(b.code));

  return (
    <PageLayout headingId="meta-heading" heading="Frontend feature support" width="narrow">
      <p>
        This frontend&apos;s allowlist (<code>NEXT_PUBLIC_SOBA_FEATURES_ALLOWED</code>):{' '}
        <strong>
          <code>{allowlist || '(none)'}</code>
        </strong>
      </p>
      <p>
        A feature is <em>active here</em> only when the platform enables it and this frontend&apos;s
        allowlist includes it.
      </p>
      <table data-testid="meta-features" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={cell}>Feature</th>
            <th style={cell}>Code</th>
            <th style={cell}>Platform</th>
            <th style={cell}>Active here</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f.code}>
              <td style={cell}>{f.name}</td>
              <td style={cell}>
                <code>{f.code}</code>
              </td>
              <td style={cell}>{f.platformAllowed ? 'enabled' : 'off'}</td>
              <td style={cell}>{isFeatureAllowed(f.code) ? '✅ yes' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageLayout>
  );
}
