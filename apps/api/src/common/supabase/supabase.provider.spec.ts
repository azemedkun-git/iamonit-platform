import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { validate } from 'class-validator';
import { createClient } from '@supabase/supabase-js';
import { RegisterDto } from '../../modules/auth/dto/register.dto';
import { AuthResponseDto } from '../../modules/auth/dto/auth-response.dto';
import type { AuthResponse } from '../../modules/auth/auth.types';
import {
  SUPABASE_ADMIN_CLIENT,
  SUPABASE_PUBLIC_CLIENT,
} from './supabase.constants';
import {
  supabaseAdminClientProvider,
  supabasePublicClientProvider,
} from './supabase.provider';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = jest.mocked(createClient);

type SupabaseClientInstance = ReturnType<typeof createClient>;

function configService(values: Record<string, string>): ConfigService {
  return {
    getOrThrow: jest.fn((name: string) => {
      const value = values[name];

      if (!value) {
        throw new Error(`Missing configuration: ${name}`);
      }

      return value;
    }),
  } as unknown as ConfigService;
}

function constructClient(
  provider: typeof supabasePublicClientProvider,
  config: ConfigService,
): SupabaseClientInstance {
  return provider.useFactory(config) as SupabaseClientInstance;
}

describe('Supabase client providers', () => {
  const url = 'https://example.supabase.co';
  const anonKey = 'anonymous-key';
  const serviceRoleKey = 'server-only-service-role-key';

  const client = {} as unknown as SupabaseClientInstance;

  beforeEach(() => {
    mockedCreateClient.mockReset();
    mockedCreateClient.mockReturnValue(client);
  });

  it('constructs the public client with only the anonymous key', () => {
    const config = configService({
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
    });

    expect(constructClient(supabasePublicClientProvider, config)).toBe(client);
    expect(supabasePublicClientProvider.provide).toBe(SUPABASE_PUBLIC_CLIENT);

    expect(mockedCreateClient).toHaveBeenCalledWith(url, anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });

    expect(config.getOrThrow).not.toHaveBeenCalledWith(
      'supabaseServiceRoleKey',
    );
  });

  it('constructs the admin client with the server-only service-role key', () => {
    const config = configService({
      supabaseUrl: url,
      supabaseServiceRoleKey: serviceRoleKey,
    });

    expect(constructClient(supabaseAdminClientProvider, config)).toBe(client);
    expect(supabaseAdminClientProvider.provide).toBe(SUPABASE_ADMIN_CLIENT);

    expect(mockedCreateClient).toHaveBeenCalledWith(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });

    expect(config.getOrThrow).not.toHaveBeenCalledWith('supabaseAnonKey');
  });

  it.each([
    ['public', supabasePublicClientProvider, 'supabaseAnonKey'],
    ['admin', supabaseAdminClientProvider, 'supabaseServiceRoleKey'],
  ] as const)(
    'rejects missing %s client configuration without constructing a client',
    (_name, provider, keyName) => {
      const config = configService({
        supabaseUrl: url,
      });

      expect(() => constructClient(provider, config)).toThrow(keyName);
      expect(mockedCreateClient).not.toHaveBeenCalled();
    },
  );

  it('does not return or serialize the service-role key', () => {
    const config = configService({
      supabaseUrl: url,
      supabaseServiceRoleKey: serviceRoleKey,
    });

    const result = constructClient(supabaseAdminClientProvider, config);

    expect(result).toBe(client);
    expect(JSON.stringify(result)).not.toContain(serviceRoleKey);
    expect(JSON.stringify(supabaseAdminClientProvider)).not.toContain(
      serviceRoleKey,
    );
  });
});

describe('authentication contracts', () => {
  const response: AuthResponse = {
    session: {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      expiresAt: 1_800_000_000,
      tokenType: 'bearer',
    },
    requiresEmailConfirmation: false,
    user: {
      id: 'user-id',
      email: 'person@example.com',
      tenantId: 'tenant-id',
      role: 'admin',
      fullName: 'Example Person',
      phone: '+13125550100',
    },
  };

  it('maps the approved session and user response fields', () => {
    expect(new AuthResponseDto(response)).toEqual(response);
  });

  it('preserves a null session for email-confirmation responses', () => {
    const dto = new AuthResponseDto({
      ...response,
      session: null,
      requiresEmailConfirmation: true,
    });

    expect(dto.session).toBeNull();
    expect(dto.requiresEmailConfirmation).toBe(true);
    expect(dto.user).toEqual(response.user);
  });

  it('rejects a client-supplied registration role', async () => {
    const input = Object.assign(new RegisterDto(), {
      email: 'person@example.com',
      password: 'password123',
      companyName: 'Example Company',
      fullName: 'Example Person',
      phone: '+13125550100',
      role: 'admin',
    });

    const errors = await validate(input, {
      forbidNonWhitelisted: true,
      whitelist: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'role',
        }),
      ]),
    );
  });
});
