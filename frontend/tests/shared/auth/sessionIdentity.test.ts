import { describe, it, expect } from 'vitest';
import { isIdentityEnded } from '@/src/shared/auth/sessionIdentity';

const base = {
  previousSubject: 'user-1',
  currentSubject: undefined as string | undefined,
  authenticated: false,
  initStarted: true,
  initializing: false,
};

describe('isIdentityEnded', () => {
  it('ends when a signed-in user signs out', () => {
    expect(isIdentityEnded(base)).toBe(true);
  });

  it('ends when a different user signs in without a sign-out in between', () => {
    expect(isIdentityEnded({ ...base, authenticated: true, currentSubject: 'user-2' })).toBe(true);
  });

  // The default state before Keycloak answers is "not authenticated". Acting on it wipes the tab
  // on every page load.
  it('does not end before init has started', () => {
    expect(isIdentityEnded({ ...base, initStarted: false })).toBe(false);
  });

  it('does not end while init is running', () => {
    expect(isIdentityEnded({ ...base, initializing: true })).toBe(false);
  });

  // An anonymous visitor has no session to end. Clearing here discards an in-flight public read.
  it('does not end for a visitor who was never signed in', () => {
    expect(isIdentityEnded({ ...base, previousSubject: undefined })).toBe(false);
  });

  it('does not end while the same user stays signed in', () => {
    expect(isIdentityEnded({ ...base, authenticated: true, currentSubject: 'user-1' })).toBe(false);
  });

  // A rotation can leave the parsed token briefly absent; that is not a departure.
  it('does not end when the subject is momentarily unknown but still authenticated', () => {
    expect(isIdentityEnded({ ...base, authenticated: true, currentSubject: undefined })).toBe(
      false,
    );
  });
});
