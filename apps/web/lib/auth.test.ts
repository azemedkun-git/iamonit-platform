import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultiTenantAuthResponse } from './auth.types';
const setSession = vi.fn();
vi.mock('./supabase', () => ({ getBrowserSupabaseClient: () => ({ auth: { setSession } }) }));
import { clearCurrentAuthState, establishAuthSession, getCurrentAuthState, selectMembership } from './auth';

const memberships = [
  { membershipId: 'one', tenantId: 'tenant-one', tenantName: 'One', role: 'admin' as const, status: 'active' as const },
  { membershipId: 'two', tenantId: 'tenant-two', tenantName: 'Two', role: 'dispatcher' as const, status: 'active' as const },
];
const response: MultiTenantAuthResponse = {
  session: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 1, expiresAt: 2, tokenType: 'bearer' }, requiresEmailConfirmation: false,
  profile: { userId: 'user', email: 'person@example.test', fullName: 'Person', phone: '+14694681177' }, memberships, selectedMembership: null,
};

describe('authentication state', () => {
  beforeEach(() => { clearCurrentAuthState(); setSession.mockReset(); setSession.mockResolvedValue({ error: null }); });
  it('installs Supabase session and retains multi-tenant context', async () => {
    await establishAuthSession(response);
    expect(setSession).toHaveBeenCalledWith({ access_token: 'access', refresh_token: 'refresh' });
    expect(getCurrentAuthState()).toEqual({ profile: response.profile, memberships, selectedMembership: null });
  });
  it('selects only the exact returned membership object', async () => {
    await establishAuthSession(response);
    expect(selectMembership({ ...memberships[0] })).toBe(false);
    expect(selectMembership(memberships[1])).toBe(true);
    expect(getCurrentAuthState()?.selectedMembership).toBe(memberships[1]);
  });
  it('rejects null sessions and clears state on installation failure', async () => {
    await expect(establishAuthSession({ ...response, session: null })).rejects.toThrow('Authentication could not be completed.');
    setSession.mockResolvedValue({ error: new Error('provider detail') });
    await expect(establishAuthSession(response)).rejects.toThrow('Authentication could not be completed.');
    expect(getCurrentAuthState()).toBeNull();
  });
});
