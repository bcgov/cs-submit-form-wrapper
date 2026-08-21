import { getSobaApiBaseUrl } from '../config/runtimeConfig';

export type SobaFetchOptions = {
  /** Bearer token; when present an Authorization header is sent. */
  token?: string;
  method?: string;
  /** JSON body; serialized and sent with a Content-Type: application/json header. */
  json?: unknown;
  /** Additional query params. */
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  cache?: RequestCache;
};

function buildUrl(path: string, options: SobaFetchOptions): string {
  const params = new URLSearchParams();
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) params.set(key, String(value));
    }
  }
  const qs = params.toString();
  const queryString = qs ? `?${qs}` : '';
  return `${getSobaApiBaseUrl()}${path}${queryString}`;
}

/**
 * Single entry point for all SOBA API calls. Injects auth/JSON headers.
 */
export async function sobaFetch(path: string, options: SobaFetchOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  const hasJsonBody = options.json !== undefined;
  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(buildUrl(path, options), {
    method: options.method ?? 'GET',
    cache: options.cache ?? 'no-store',
    headers,
    body: hasJsonBody ? JSON.stringify(options.json) : undefined,
  });

  return response;
}

