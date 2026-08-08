import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthResponse } from './auth.types';

const setSession = vi.fn();
vi.mock('./supabase', () => ({
  getBrowserSupabaseClient: () => ({ auth: { setSession } }),
}));

import {
  clearCurrentAuthUser,
  establishAuthSession,
  getCurrentAuthUser,
} from './auth';

const response: AuthResponse = {
  session: {
    accessToken: 'access-value',
    refreshToken: 'refresh-value',
    expiresIn: 3600,
    expiresAt: 2_000_000_000,
    tokenType: 'bearer',
  },
  requiresEmailConfirmation: false,
  user: {
    id: 'user-id', email: 'admin@example.test', tenantId: 'tenant-id',
    role: 'admin', fullName: 'Example Admin', phone: '555-0100',
  },
};

describe('authentication session helpers', () => {
  beforeEach(() => {
    clearCurrentAuthUser();
    setSession.mockReset();
    setSession.mockResolvedValue({ error: null });
  });

  it('installs the Supabase session and retains display user context in memory', async () => {
    await establishAuthSession(response);
    expect(setSession).toHaveBeenCalledWith({
      access_token: 'access-value', refresh_token: 'refresh-value',
    });
    expect(getCurrentAuthUser()).toEqual(response.user);
  });

  it('rejects a null session without retaining user context', async () => {
    await expect(establishAuthSession({ ...response, session: null })).rejects.toThrow(
      'Authentication could not be completed. Please try again.',
    );
    expect(setSession).not.toHaveBeenCalled();
    expect(getCurrentAuthUser()).toBeNull();
  });

  it('clears partial state and returns a safe error when installation fails', async () => {
    setSession.mockResolvedValue({ error: new Error('provider detail') });
    await expect(establishAuthSession(response)).rejects.toThrow(
      'Authentication could not be completed. Please try again.',
    );
    expect(getCurrentAuthUser()).toBeNull();
  });
});
