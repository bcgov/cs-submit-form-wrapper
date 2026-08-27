import { describe, it, expect } from 'vitest';
import { hasSobaAdminRole } from '@/src/shared/auth/sobaAdmin';

describe('hasSobaAdminRole', () => {
  it('returns false without a token', () => {
    expect(hasSobaAdminRole(undefined)).toBe(false);
    expect(hasSobaAdminRole(null)).toBe(false);
  });

  it('detects the role in the flat roles claim', () => {
    expect(hasSobaAdminRole({ roles: ['soba_admin'] })).toBe(true);
  });

  it('detects the role in realm_access', () => {
    expect(hasSobaAdminRole({ realm_access: { roles: ['other', 'soba_admin'] } })).toBe(true);
  });

  it('detects the role in client_roles', () => {
    expect(hasSobaAdminRole({ client_roles: ['soba_admin'] })).toBe(true);
  });

  it('returns false when no claim carries the role', () => {
    expect(
      hasSobaAdminRole({ roles: ['user'], realm_access: { roles: ['user'] }, client_roles: [] }),
    ).toBe(false);
  });

  it('ignores malformed claims', () => {
    expect(hasSobaAdminRole({ roles: 'soba_admin', realm_access: 'soba_admin' })).toBe(false);
  });
});
