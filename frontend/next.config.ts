import type { NextConfig } from 'next';
import { join } from 'path';
import packageJson from './package.json';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  output: 'standalone',
  // Overridable so a second local dev server (forms/submit-mode) can build into its
  // own dir instead of racing the designer server on .next. Unset in Docker → .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  basePath: process.env.BASE_PATH || '',
  // React Aria ships ESM that needs transpiling for the App Router server
  // graph; without this, SSR fails with "createContext is not a function".
  transpilePackages: ['react-aria-components', '@bcgov/design-system-react-components'],
  // Required for standalone in monorepo: trace deps from workspace root
  outputFileTracingRoot: join(__dirname, '..'),
  turbopack: {
    // root needs to point to workspace root so Next.js can locate hoisted
    // dependencies (like `next`) during a filtered install.
    root: join(__dirname, '..'),
  },
};

export default nextConfig;
