import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, loginMultiTenant, normalizeApiBaseUrl, registerCarPuller, registerTransporter } from './api';
import type { MultiTenantAuthResponse } from './auth.types';

const response: MultiTenantAuthResponse = {
  session: { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600, expiresAt: 2_000_000_000, tokenType: 'bearer' },
  requiresEmailConfirmation: false,
  profile: { userId: 'user-id', email: 'person@example.test', fullName: 'Person', phone: '+14694681177' },
  memberships: [{ membershipId: 'membership-id', tenantId: 'tenant-id', tenantName: 'Example Co', role: 'admin', status: 'active' }],
  selectedMembership: { membershipId: 'membership-id', tenantId: 'tenant-id', tenantName: 'Example Co', role: 'admin', status: 'active' },
};
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });

describe('multi-tenant authentication API client', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/root/'));
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('normalizes configuration safely', () => {
    expect(normalizeApiBaseUrl('https://api.example.test/root///')).toBe('https://api.example.test/root');
    expect(() => normalizeApiBaseUrl(undefined)).toThrow(new ApiError(0, 'The service is not configured.'));
  });

  it.each([
    ['transporter', registerTransporter, '/auth/register/transporter', { email: 'person@example.test', password: 'password1', companyName: 'Example Co', fullName: 'Person', phone: '+14694681177' }],
    ['car puller', registerCarPuller, '/auth/register/car-puller', { email: 'person@example.test', password: 'password1', fullName: 'Person', phone: '+14694681177' }],
    ['login', loginMultiTenant, '/auth/login/multi-tenant', { email: 'person@example.test', password: 'password1' }],
  ])('posts the exact %s endpoint and payload', async (_name, request, path, payload) => {
    const fetchMock = vi.fn().mockResolvedValue(json(response)); vi.stubGlobal('fetch', fetchMock);
    await expect(request(payload as never)).resolves.toEqual(response);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.example.test/root${path}`); expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(payload);
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
    expect(new Headers(init.headers).has('X-IAMONIT-Tenant-Id')).toBe(false);
  });

  it.each([
    ['profile', { ...response, profile: { userId: 'user-id' } }],
    ['membership', { ...response, memberships: [{ ...response.memberships[0], role: 'owner' }] }],
    ['selected membership', { ...response, selectedMembership: { ...response.selectedMembership!, membershipId: 'other' } }],
    ['session', { ...response, session: { accessToken: 'only-one-field' } }],
  ])('rejects malformed %s responses', async (_name, malformed) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(malformed)));
    await expect(loginMultiTenant({ email: 'person@example.test', password: 'password1' })).rejects.toEqual(new ApiError(200, 'The service returned an unexpected response.'));
  });

  it('accepts a session-null email-confirmation response', async () => {
    const confirmation = { ...response, session: null, requiresEmailConfirmation: true, memberships: [], selectedMembership: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(confirmation)));
    await expect(registerCarPuller({ email: 'person@example.test', password: 'password1', fullName: 'Person', phone: '+14694681177' })).resolves.toEqual(confirmation);
  });

  it('preserves approved errors and hides provider details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ statusCode: 401, message: 'Invalid email or password.', error: 'Unauthorized' }, { status: 401 })));
    await expect(loginMultiTenant({ email: 'person@example.test', password: 'password1' })).rejects.toEqual(new ApiError(401, 'Invalid email or password.'));
  });
});
