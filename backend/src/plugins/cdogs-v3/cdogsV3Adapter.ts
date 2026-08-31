import { PluginConfigReader } from '../../core/config/pluginConfig';
import {
  DocumentGenerationAdapter,
  DocumentRenderResult,
} from '../../core/integrations/document-generation/DocumentGenerationAdapter';
import { HttpClient, joinUrl } from '../../core/http/httpClient';
import { postBinaryOrThrow } from '../../core/http/httpErrorMapper';
import { toCdogsRenderBody } from '../shared/cdogs/renderBody';

const SERVICE = 'CDOGS';
const RENDER_PATH = '/template/render';

/**
 * CDOGS v3 (Carbone Enterprise) document generator. Runs behind a private, unauthenticated
 * URL, so no token provider is wired. If auth is added later, pass a getToken like v2.
 */
export class CdogsV3Adapter implements DocumentGenerationAdapter {
  private readonly http: HttpClient;

  constructor(config: PluginConfigReader) {
    this.http = new HttpClient({
      baseUrl: joinUrl(config.getRequired('ENDPOINT'), 'v3'),
      timeoutMs: config.getOptionalNumber('TIMEOUT_MS'),
    });
  }

  render(payload: Record<string, unknown>): Promise<DocumentRenderResult> {
    return postBinaryOrThrow(this.http, RENDER_PATH, toCdogsRenderBody(payload), SERVICE);
  }
}
