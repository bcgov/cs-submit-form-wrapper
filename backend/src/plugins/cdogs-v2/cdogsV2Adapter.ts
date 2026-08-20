import { PluginConfigReader } from '../../core/config/pluginConfig';
import {
  DocumentGenerationAdapter,
  DocumentGenerationReadinessResult,
  DocumentRenderResult,
} from '../../core/integrations/document-generation/DocumentGenerationAdapter';
import { HttpClient, HttpClientError, joinUrl } from '../../core/http/httpClient';
import { httpErrorToAppError } from '../../core/http/httpErrorMapper';
import { OAuth2TokenProvider } from '../../core/auth/oauth2TokenProvider';
import { toCdogsRenderBody } from '../shared/cdogs/renderBody';
import { log } from '../../core/logging';

const SERVICE = 'CDOGS';
const PLUGIN = 'cdogs-v2';
const RENDER_PATH = '/template/render';
const HEALTH_PATH = '/health';

const isTokenRejected = (err: unknown): boolean =>
  err instanceof HttpClientError && err.status === 401;

/** CDOGS v2 document generator. Authenticated via OAuth2 client-credentials. */
export class CdogsV2Adapter implements DocumentGenerationAdapter {
  private readonly http: HttpClient;
  private readonly tokenProvider: OAuth2TokenProvider;

  constructor(config: PluginConfigReader) {
    const timeoutMs = config.getOptionalNumber('TIMEOUT_MS');
    this.tokenProvider = new OAuth2TokenProvider({
      tokenUrl: config.getRequired('TOKEN_URL'),
      clientId: config.getRequired('CLIENT_ID'),
      clientSecret: config.getRequired('CLIENT_SECRET'),
      label: PLUGIN,
      timeoutMs,
    });
    this.http = new HttpClient({
      baseUrl: joinUrl(config.getRequired('ENDPOINT'), 'v2'),
      // Spends the render's remaining budget, so the token leg can't add a second full timeout.
      getToken: (remainingMs) => this.tokenProvider.getToken(remainingMs),
      timeoutMs,
    });
  }

  async render(payload: Record<string, unknown>): Promise<DocumentRenderResult> {
    try {
      return await this.attemptRender(payload);
    } catch (err) {
      if (isTokenRejected(err)) {
        log.error(
          { plugin: PLUGIN },
          'CDOGS rejected the access token after refresh — check client credentials/permissions',
        );
      }
      throw httpErrorToAppError(err, SERVICE);
    }
  }

  private async attemptRender(payload: Record<string, unknown>): Promise<DocumentRenderResult> {
    const body = toCdogsRenderBody(payload);
    // One budget for the attempt and its retry, so a 401 can't double the time the pod holds this.
    const deadline = this.http.deadline();
    try {
      return await this.http.postJsonForBinary(RENDER_PATH, body, deadline);
    } catch (err) {
      if (!isTokenRejected(err)) throw err;
      // CDOGS rejected our token — drop the cached token and retry once.
      log.warn({ plugin: PLUGIN }, 'CDOGS rejected the access token; refreshing and retrying');
      this.tokenProvider.clearCache();
      return this.http.postJsonForBinary(RENDER_PATH, body, deadline);
    }
  }

  /** Liveness: authenticated GET /health. Proves CDOGS is reachable and our credentials are valid. */
  async readinessCheck(): Promise<DocumentGenerationReadinessResult> {
    try {
      await this.http.get(HEALTH_PATH);
      return { ok: true };
    } catch (err) {
      // A rejected token is likely stale; drop it so the next check re-fetches.
      if (isTokenRejected(err)) this.tokenProvider.clearCache();
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }
}
