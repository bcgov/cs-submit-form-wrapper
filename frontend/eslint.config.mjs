import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import sonarjs from 'eslint-plugin-sonarjs';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    // Second dev-server build dir (forms/submit-mode via NEXT_DIST_DIR).
    '.next-forms/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated ESLint bulk-suppressions baseline; not hand-edited, so don't lint it.
    'eslint-suppressions.json',
  ]),
  // Disallow console in app code. Error logging goes through the notification
  // store's `consoleError` option (the single sanctioned logging sink).
  {
    plugins: { sonarjs },
    rules: {
      'no-console': 'error',
      // Minimal SonarCloud parity for the smells that have bitten us, at Sonar Way thresholds.
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
      // S3358: ternary operators should not be nested.
      'sonarjs/no-nested-conditional': 'error',
    },
  },
  // Tests and test/build config legitimately use/wrap console and repeat fixture literals.
  {
    files: ['tests/**', '**/*.test.{ts,tsx}', 'vitest.setup.ts', 'vitest.config.ts'],
    rules: {
      'no-console': 'off',
      'sonarjs/no-duplicate-string': 'off',
    },
  },
]);

export default eslintConfig;
