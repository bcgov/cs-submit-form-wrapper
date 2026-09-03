import { describe, it, expect } from 'vitest';
import { loadErrorMessage } from '@/src/shared/api/loadErrorMessage';
import { SessionExpiredError } from '@/src/shared/api/sobaFetch';
import { ApiError } from '@/src/shared/api/sobaHelpers';

const MESSAGES = {
  sessionExpired: 'Sign in again.',
  noAccess: 'You do not have access to this.',
  failed: 'Failed to load forms.',
};

describe('loadErrorMessage', () => {
  it('asks an ended session to sign in again', () => {
    expect(loadErrorMessage(new SessionExpiredError(), MESSAGES)).toBe(MESSAGES.sessionExpired);
  });

  it('reports a refusal as no access', () => {
    expect(loadErrorMessage(new ApiError('Forbidden', 403), MESSAGES)).toBe(MESSAGES.noAccess);
  });

  // A 401 reaches a caller only when it is not about permission: sobaFetch has already turned an
  // authenticated one it could not refresh past into a SessionExpiredError.
  it('does not read a 401 as a permission refusal', () => {
    expect(loadErrorMessage(new ApiError('Unauthorized', 401), MESSAGES)).toBe(MESSAGES.failed);
  });

  // The backend's own string is untranslated and reaches the user as "Request failed (500)".
  it('never returns the error message', () => {
    expect(loadErrorMessage(new ApiError('Request failed (500)', 500), MESSAGES)).toBe(
      MESSAGES.failed,
    );
    expect(loadErrorMessage(new Error('boom'), MESSAGES)).toBe(MESSAGES.failed);
    expect(loadErrorMessage('boom', MESSAGES)).toBe(MESSAGES.failed);
  });
});
