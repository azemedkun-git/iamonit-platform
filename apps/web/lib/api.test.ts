import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, login, normalizeApiBaseUrl, register } from './api';
import type { AuthResponse, LoginRequest, RegisterRequest } from './auth.types';

const registerRequest: RegisterRequest = {
  email: 'admin@example.test',
  password: 'credential-value',
  companyName: 'Example Transport',
  fullName: 'Example Admin',
  phone: '555-0100',
};

const loginRequest: LoginRequest = {
  email: 'admin@example.test',
  password: 'credential-value',
};

const authResponse: AuthResponse = {
  session: {
    accessToken: 'access-session-value',
    refreshToken: 'refresh-session-value',
    expiresIn: 3600,
    expiresAt: 2_000_000_000,
    tokenType: 'bearer',
  },
  requiresEmailConfirmation: false,
  user: {
    id: 'user-id',
    email: 'admin@example.test',
    tenantId: 'tenant-id',
    role: 'admin',
    fullName: 'Example Admin',
    phone: '555-0100',
  },
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

describe('authentication API client', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.test/root/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('normalizes a valid base URL without inventing a fallback', () => {
    expect(normalizeApiBaseUrl('https://api.example.test/root///')).toBe(
      'https://api.example.test/root',
    );
    expect(() => normalizeApiBaseUrl(undefined)).toThrow(
      new ApiError(0, 'The service is not configured.'),
    );
  });

  it.each([
    'not a URL',
    'ftp://api.example.test',
    'https://user:password@api.example.test',
    'https://api.example.test?environment=secret',
    'https://api.example.test#secret',
  ])('rejects invalid base URL configuration safely', (configuredUrl) => {
    expect(() => normalizeApiBaseUrl(configuredUrl)).toThrow(
      new ApiError(0, 'The service is not configured.'),
    );
  });

  it('posts the exact registration payload and returns a validated response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(authResponse));
    vi.stubGlobal('fetch', fetchMock);

    await expect(register(registerRequest)).resolves.toEqual(authResponse);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/root/auth/register');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(registerRequest);
    expect(Object.keys(JSON.parse(init.body as string))).toEqual([
      'email',
      'password',
      'companyName',
      'fullName',
      'phone',
    ]);
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    );
    expect(new Headers(init.headers).has('Authorization')).toBe(false);
  });

  it('posts the exact login payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(authResponse));
    vi.stubGlobal('fetch', fetchMock);

    await login(loginRequest);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.test/root/auth/login');
    expect(JSON.parse(init.body as string)).toEqual(loginRequest);
    expect(Object.keys(JSON.parse(init.body as string))).toEqual([
      'email',
      'password',
    ]);
  });

  it('sends one bearer Authorization header when an access token is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(authResponse));
    vi.stubGlobal('fetch', fetchMock);

    await login(loginRequest, { accessToken: 'bearer-value' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer bearer-value');
    expect(
      [...headers.keys()].filter((name) => name === 'authorization'),
    ).toHaveLength(1);
  });

  it('preserves documented safe backend errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            statusCode: 409,
            message: 'An account with this email already exists.',
            error: 'Conflict',
          },
          { status: 409 },
        ),
      ),
    );

    await expect(register(registerRequest)).rejects.toEqual(
      new ApiError(409, 'An account with this email already exists.'),
    );
  });

  it.each([
    [
      'malformed JSON',
      new Response('{', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ],
    [
      'non-JSON content',
      new Response('provider details', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
      }),
    ],
    [
      'an unexpected success shape',
      jsonResponse({ session: { accessToken: 'leaked-value' } }),
    ],
    [
      'provider-detail errors',
      jsonResponse(
        {
          statusCode: 503,
          message: 'provider details',
          details: 'private body',
        },
        { status: 503 },
      ),
    ],
  ])('converts %s into a generic safe error', async (_caseName, response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(login(loginRequest)).rejects.toMatchObject({
      status: response.status,
      message: expect.stringMatching(/request|unexpected response/i),
    });
  });

  it('converts network failures into a generic safe error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('private network detail')),
    );

    await expect(login(loginRequest)).rejects.toEqual(
      new ApiError(0, 'The request could not be completed. Please try again.'),
    );
  });

  it('never exposes credentials or session values in errors or logs', async () => {
    const logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            message: 'credential-value access-session-value refresh-session-value',
            providerBody: 'private provider response',
          },
          { status: 500 },
        ),
      ),
    );

    let error: unknown;
    try {
      await login(loginRequest, { accessToken: 'authorization-session-value' });
    } catch (caught) {
      error = caught;
    }

    const serializedError = `${String(error)} ${JSON.stringify(error)}`;
    expect(serializedError).not.toContain('credential-value');
    expect(serializedError).not.toContain('access-session-value');
    expect(serializedError).not.toContain('refresh-session-value');
    expect(serializedError).not.toContain('authorization-session-value');
    expect(logSpies.every((spy) => spy.mock.calls.length === 0)).toBe(true);
  });
});
