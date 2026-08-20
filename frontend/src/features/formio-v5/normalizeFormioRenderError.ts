import { isSessionExpired } from '@/src/shared/api/sobaFetch';

/**
 * Turn Form.io `@formio/react` <Form /> `onError` payloads into a single user-facing string.
 * Form.io passes booleans, strings, Error instances, arrays (e.g. submission validation),
 * and API shapes like `{ error: string, formattedKeyOrPath?: string }` — not for structured logging.
 */
function formioErrorPartToMessage(part: unknown): string | null {
  if (part == null) return null;
  if (typeof part === 'string') return part;
  if (part instanceof Error) return part.message;
  if (typeof part === 'object' && !Array.isArray(part)) {
    const o = part as Record<string, unknown>;
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim();
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim();
  }
  return null;
}

/**
 * `sessionExpiredMessage` is the translated string for an ended session; without it a
 * SessionExpiredError would reach the page as its untranslated `message`.
 */
export function normalizeFormioRenderError(
  err: unknown,
  fallbackMessage: string,
  sessionExpiredMessage?: string,
): string {
  if (sessionExpiredMessage && isSessionExpired(err)) return sessionExpiredMessage;
  if (err === false) return fallbackMessage;
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (Array.isArray(err)) {
    const parts = err.map(formioErrorPartToMessage).filter((s): s is string => Boolean(s));
    return parts.length > 0 ? parts.join('; ') : fallbackMessage;
  }
  const single = formioErrorPartToMessage(err);
  if (single) return single;
  return fallbackMessage;
}
