/** Carries the HTTP status so callers can tell a refusal from a failure. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** The caller is signed in and the server said no. Distinct from a load that failed. */
export const isForbidden = (err: unknown): boolean =>
  err instanceof ApiError && (err.status === 403 || err.status === 401);

export async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Surface the backend's `{ error }` message (e.g. name-taken, disclaimer) when present.
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body?.error === 'string' && body.error) message = body.error;
    } catch {
      // Non-JSON error body; keep the status-based message.
    }
    throw new ApiError(message, response.status);
  }
  // Unchecked cast. A caller that expects a list has to guard for one.
  return (await response.json()) as T;
}
