import { loadFeaturesMeta } from '@/src/shared/config/featuresMeta';
import { createIsFeatureAllowed, FEATURE_CODES } from '@/src/shared/featureFlags/flags';
import { getKeycloakInstance } from '@/lib/slices/keycloakSlice';
import { ensureFreshToken } from '@/src/shared/auth/tokenRefresh';
import { getActiveSubmissionId } from './activeSubmission';
import { getSobaApiBaseUrl, loadFrontendRuntimeConfig } from '@/src/shared/config/runtimeConfig';

interface ChefsProviderConfig {
  /** Files collection URL; the provider posts here and builds each file's url as `${filesUrl}/<id>`. */
  filesUrl: string | (() => string | Promise<string>);
  getToken: () => string | Promise<string>;
  getWorkspaceId?: () => string | Promise<string>;
  getSubmissionId?: () => string | Promise<string>;
}

interface BcgovFormioModule {
  default?: unknown;
  createChefsProvider?: (config: ChefsProviderConfig) => unknown;
}

interface FormioWithProviders {
  use: (plugin: unknown) => void;
  Providers?: { addProvider: (type: string, name: string, provider: unknown) => void };
}

let registrationPromise: Promise<{ filesEnabled: boolean }> | null = null;

/**
 * Register the BC Gov Form.io components and, when the `files` feature is on, the CHEFS storage
 * provider. Idempotent. Enablement comes from GET /meta/features, so nothing bcgov loads when the
 * feature is off. The provider is injected with the app's api base, token, and the submission id.
 */
export function ensureBcgovFormioRegistered(): Promise<{ filesEnabled: boolean }> {
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    const meta = await loadFeaturesMeta().catch(() => null);
    const filesEnabled = meta ? createIsFeatureAllowed(meta)(FEATURE_CODES.FILES) : false;
    if (!filesEnabled) return { filesEnabled };

    // Load runtime config first so getSobaApiBaseUrl() returns the resolved API base, not the early
    // bootstrap value, when filesUrl is read.
    await loadFrontendRuntimeConfig().catch(() => {});

    const { Formio } = await import('@formio/js');
    const bcgovMod = (await import('formio-components@0.0.1')) as unknown as BcgovFormioModule;
    const formio = Formio as unknown as FormioWithProviders;

    formio.use(bcgovMod.default ?? bcgovMod);

    const createChefsProvider = bcgovMod.createChefsProvider;
    if (createChefsProvider && formio.Providers) {
      formio.Providers.addProvider(
        'storage',
        'chefs',
        createChefsProvider({
          // A getter so getSobaApiBaseUrl() is read per request (after runtime config has loaded).
          filesUrl: () => {
            const apiUrl = getSobaApiBaseUrl();
            return `${apiUrl}/submit/files`;
          },
          // Shares sobaFetch's refresh and its rule: an affirmative no-session sends nothing rather
          // than a stale token, but without a verdict we fall back to what the instance holds.
          getToken: async () => {
            const outcome = await ensureFreshToken();
            if (outcome.status === 'token') return outcome.token;
            return outcome.status === 'unavailable' ? (getKeycloakInstance()?.token ?? '') : '';
          },
          // The submission currently being filled (set by the fill page); uploads are tagged with it,
          // and the backend derives the workspace from it — so no workspace id is passed.
          getSubmissionId: () => getActiveSubmissionId() ?? '',
        }),
      );
    }

    return { filesEnabled };
  })();

  return registrationPromise;
}
