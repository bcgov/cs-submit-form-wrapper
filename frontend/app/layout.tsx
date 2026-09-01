import './globals.css';
import '../public/App.css';

const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_SOBA_API_BASE_URL || DEFAULT_API_BASE_URL;
  const featuresAllowed = process.env.NEXT_PUBLIC_SOBA_FEATURES_ALLOWED ?? '';
  // Read here rather than in client code: a NEXT_PUBLIC_ value referenced from the browser bundle is
  // fixed at build time, and one image serves every deployment.
  const designerAppUrl = process.env.NEXT_PUBLIC_SOBA_DESIGNER_APP_URL ?? '';
  const formsAppUrl = process.env.NEXT_PUBLIC_SOBA_FORMS_APP_URL ?? '';
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__SOBA_API_BASE_URL=${JSON.stringify(apiBaseUrl)};window.__SOBA_FEATURES_ALLOWED=${JSON.stringify(featuresAllowed)};window.__SOBA_DESIGNER_APP_URL=${JSON.stringify(designerAppUrl)};window.__SOBA_FORMS_APP_URL=${JSON.stringify(formsAppUrl)};`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
