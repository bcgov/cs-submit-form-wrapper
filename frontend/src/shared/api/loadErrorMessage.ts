import { isSessionExpired } from './sobaFetch';
import { isForbidden } from './sobaHelpers';

export type LoadErrorMessages = {
  sessionExpired: string;
  noAccess: string;
  failed: string;
};

/**
 * What to show the user for a read that failed. The three cases ask for different things: sign in
 * again, ask someone for access, or try again. Never fall back to `Error.message` -- it is the
 * backend's string, untranslated, and reaches the user as "Request failed (403)".
 */
export function loadErrorMessage(err: unknown, messages: LoadErrorMessages): string {
  if (isSessionExpired(err)) return messages.sessionExpired;
  if (isForbidden(err)) return messages.noAccess;
  return messages.failed;
}
