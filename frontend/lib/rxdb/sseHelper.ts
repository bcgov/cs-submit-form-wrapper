import { fetchEventSource } from '@microsoft/fetch-event-source';

export class FatalAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalAuthError';
  }
}

export interface SseReplicationOptions {
  sseUrl: string;
  token?: string;
  abortController: AbortController;
  onMessage: (data: unknown) => void;
  onAuthRequired?: () => void;
}

export function setupSseReplication({
  sseUrl,
  token,
  abortController,
  onMessage,
  onAuthRequired,
}: SseReplicationOptions) {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Tracking exponential backoff delay (starting at 1000ms, capping at 30000ms)
  let currentRetryDelay = 1000;
  const MAX_RETRY_DELAY = 30000;

  fetchEventSource(sseUrl, {
    method: 'GET',
    headers,
    signal: abortController.signal,
    openWhenHidden: true,

    async onopen(response) {
      if (response.status === 401 || response.status === 403) {
        if (onAuthRequired) {
          onAuthRequired();
        }
        throw new FatalAuthError(`Stream connection failed with status: ${response.status}`);
      }

      if (!response.ok) {
        throw new Error(`Server returned unexpected error status: ${response.status}`);
      }

      currentRetryDelay = 1000;
    },

    async onmessage(event) {
      if (!event.data) return;

      try {
        const parsed = JSON.parse(event.data) as unknown;
        onMessage(parsed);
      } catch {}
    },

    onerror(err) {
      if (err instanceof FatalAuthError) {
        throw err;
      }
      const delayToWait = currentRetryDelay;
      currentRetryDelay = Math.min(currentRetryDelay * 2, MAX_RETRY_DELAY);
      return delayToWait;
    },
  });
}
