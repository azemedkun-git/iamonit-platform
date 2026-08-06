import {
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthRepository } from './auth.repository';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const userId = '3d10ad51-1d6c-4dfc-9a12-38337bed3440';
  const tenantId = '1aa6f7f9-e3ec-4b32-93ab-5baac785c05f';
  const token = 'sensitive-access-token';
  const claims = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://project.supabase.co/auth/v1',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { tenantId: 'jwt-tenant', role: 'admin' },
  };

  function createSubject(options?: {
    claimOverrides?: Record<string, unknown>;
    claimsError?: unknown;
    claimsFailure?: unknown;
    access?: Record<string, unknown> | null;
    databaseFailure?: unknown;
  }) {
    const getClaims = options?.claimsFailure
      ? jest.fn().mockRejectedValue(options.claimsFailure)
      : jest.fn().mockResolvedValue({
          data: options?.claimsError
            ? null
            : { claims: { ...claims, ...options?.claimOverrides } },
          error: options?.claimsError ?? null,
        });
    const findApplicationAccess = options?.databaseFailure
      ? jest.fn().mockRejectedValue(options.databaseFailure)
      : jest.fn().mockResolvedValue(
          options && 'access' in options
            ? options.access
            : {
                userId,
                tenantId,
                role: 'dispatcher',
                tenantExists: true,
                tenantStatus: 'active',
              },
        );
    const client = { auth: { getClaims } } as unknown as SupabaseClient;
    const repository = { findApplicationAccess } as unknown as AuthRepository;
    const config = {
      getOrThrow: jest.fn((key: string) =>
        key === 'supabaseUrl'
          ? 'https://project.supabase.co/'
          : 'postgresql://not-opened',
      ),
    } as unknown as ConfigService;

    return {
      subject: new JwtStrategy(client, config, repository),
      getClaims,
      findApplicationAccess,
    };
  }

  it.each(['admin', 'dispatcher', 'car_puller'])(
    'verifies a token and returns database-derived %s access',
    async (role) => {
      const { subject, getClaims, findApplicationAccess } = createSubject({
        access: {
          userId,
          tenantId,
          role,
          tenantExists: true,
          tenantStatus: 'active',
        },
      });

      await expect(subject.verify(token)).resolves.toEqual({
        userId,
        tenantId,
        role,
      });
      expect(getClaims).toHaveBeenCalledWith(token);
      expect(findApplicationAccess).toHaveBeenCalledWith(userId);
    },
  );

  it.each([undefined, '', '   '])('rejects missing token input', async (value) => {
    const { subject, getClaims } = createSubject();

    await expect(subject.verify(value as string)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(getClaims).not.toHaveBeenCalled();
  });

  it.each([
    ['expired', { exp: Math.floor(Date.now() / 1000) - 1 }],
    ['wrong issuer', { iss: 'https://other.example/auth/v1' }],
    ['wrong audience', { aud: 'other' }],
    ['wrong audience array', { aud: ['other'] }],
    ['wrong auth role', { role: 'anon' }],
    ['missing subject', { sub: undefined }],
    ['malformed subject', { sub: 'not-a-uuid' }],
  ])('rejects %s claims', async (_name, claimOverrides) => {
    const { subject } = createSubject({ claimOverrides });
    await expect(subject.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts an authenticated audience array', async () => {
    const { subject } = createSubject({
      claimOverrides: { aud: ['other', 'authenticated'] },
    });
    await expect(subject.verify(token)).resolves.toMatchObject({ userId });
  });

  it('maps provider rejection and malformed provider output to 401', async () => {
    const rejected = createSubject({ claimsError: { status: 401 } }).subject;
    const malformed = createSubject({ claimOverrides: { exp: 'later' } }).subject;

    await expect(rejected.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(malformed.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['missing app user', null],
    [
      'missing tenant',
      { userId, tenantId, role: 'admin', tenantExists: false, tenantStatus: null },
    ],
    [
      'inactive tenant',
      { userId, tenantId, role: 'admin', tenantExists: true, tenantStatus: 'suspended' },
    ],
  ])('maps %s to 403', async (_name, access) => {
    const { subject } = createSubject({ access });
    await expect(subject.verify(token)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each([
    ['invalid role', { userId, tenantId, role: 'owner', tenantExists: true, tenantStatus: 'active' }],
    ['mismatched user', { userId: tenantId, tenantId, role: 'admin', tenantExists: true, tenantStatus: 'active' }],
    ['invalid tenant id', { userId, tenantId: 'bad', role: 'admin', tenantExists: true, tenantStatus: 'active' }],
  ])('maps %s stored context to 500', async (_name, access) => {
    const { subject } = createSubject({ access });
    await expect(subject.verify(token)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('maps provider and PostgreSQL availability failures to 503', async () => {
    const provider = createSubject({
      claimsFailure: { code: 'ECONNREFUSED' },
    }).subject;
    const database = createSubject({
      databaseFailure: { code: '57P03' },
    }).subject;

    await expect(provider.verify(token)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(database.verify(token)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps unexpected provider verification failure to 401 and database failure to 500', async () => {
    const provider = createSubject({ claimsFailure: new Error('bad token') }).subject;
    const database = createSubject({ databaseFailure: new Error('broken row') }).subject;

    await expect(provider.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(database.verify(token)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('keeps tokens, secrets, provider bodies, and connection values out of errors and logs', async () => {
    const sensitive = [
      token,
      'refresh-token',
      'password-value',
      'anonymous-key',
      'service-role-key',
      'jwt-secret',
      'provider-response-body',
      'postgresql://user:password@host/database',
    ];
    const consoleSpies = [
      jest.spyOn(console, 'log').mockImplementation(),
      jest.spyOn(console, 'error').mockImplementation(),
      jest.spyOn(console, 'warn').mockImplementation(),
    ];
    const { subject } = createSubject({
      claimsFailure: new Error(sensitive.join(' ')),
    });

    const error = await subject.verify(token).catch((failure: unknown) => failure);
    const serialized = JSON.stringify(error);

    for (const value of sensitive) {
      expect(serialized).not.toContain(value);
    }
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
