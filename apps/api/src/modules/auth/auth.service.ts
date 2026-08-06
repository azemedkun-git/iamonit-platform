import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_ADMIN_CLIENT,
  SUPABASE_PUBLIC_CLIENT,
} from '../../common/supabase/supabase.constants';
import { AuthRepository } from './auth.repository';
import { AuthResponse, AuthSession } from './auth.types';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly repository: AuthRepository;

  constructor(
    @Inject(SUPABASE_PUBLIC_CLIENT)
    private readonly publicClient: SupabaseClient,
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly adminClient: SupabaseClient,
    configService: ConfigService,
    @Optional() repository?: AuthRepository,
  ) {
    this.repository =
      repository ??
      new AuthRepository(configService.getOrThrow<string>('databaseUrl'));
  }

  async register(input: RegisterDto): Promise<AuthResponse> {
    let authResult;

    try {
      authResult = await this.publicClient.auth.signUp({
        email: input.email,
        password: input.password,
      });
    } catch (error) {
      throw this.mapProviderError(error);
    }

    if (authResult.error) {
      throw this.mapProviderError(authResult.error);
    }

    const authUser = authResult.data.user;

    if (!authUser) {
      throw new InternalServerErrorException(
        'Registration could not be completed.',
      );
    }

    let tenantId: string;

    try {
      ({ tenantId } = await this.repository.createCompanyAccount({
        authUserId: authUser.id,
        companyName: input.companyName,
        fullName: input.fullName,
        phone: input.phone,
      }));
    } catch (databaseError) {
      try {
        const compensation = await this.adminClient.auth.admin.deleteUser(
          authUser.id,
        );

        if (compensation.error) {
          throw new Error('Auth compensation was rejected.');
        }
      } catch {
        this.logger.error(
          `Auth compensation failed for orphaned user ${authUser.id}.`,
        );
        throw new InternalServerErrorException(
          'Registration could not be completed.',
        );
      }

      throw this.mapDatabaseError(databaseError);
    }

    const session = authResult.data.session;

    return {
      session: session ? this.toSession(session) : null,
      requiresEmailConfirmation: session === null,
      user: {
        id: authUser.id,
        email: authUser.email ?? input.email,
        tenantId,
        role: 'admin',
        fullName: input.fullName,
        phone: input.phone,
      },
    };
  }

  private toSession(session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    token_type: string;
  }): AuthSession {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      expiresAt: session.expires_at ?? 0,
      tokenType: session.token_type,
    };
  }

  private mapProviderError(error: unknown): Error {
    if (isDuplicateEmailError(error)) {
      return new ConflictException(
        'An account with this email already exists.',
      );
    }

    if (isUnavailableError(error)) {
      return new ServiceUnavailableException(
        'Authentication provider is unavailable.',
      );
    }

    return new InternalServerErrorException(
      'Registration could not be completed.',
    );
  }

  private mapDatabaseError(error: unknown): Error {
    if (isPostgresError(error) && error.code === '23505') {
      return new ConflictException(
        error.constraint?.includes('tenant')
          ? 'A company with this name already exists.'
          : 'An account with this email already exists.',
      );
    }

    if (isUnavailableError(error)) {
      return new ServiceUnavailableException('Database is unavailable.');
    }

    return new InternalServerErrorException(
      'Registration could not be completed.',
    );
  }
}

interface ErrorDetails {
  code?: string;
  constraint?: string;
  message?: string;
  status?: number;
}

function errorDetails(error: unknown): ErrorDetails {
  return typeof error === 'object' && error !== null
    ? (error as ErrorDetails)
    : {};
}

function isPostgresError(error: unknown): error is ErrorDetails {
  return typeof errorDetails(error).code === 'string';
}

function isDuplicateEmailError(error: unknown): boolean {
  const details = errorDetails(error);
  const message = details.message?.toLowerCase() ?? '';

  return (
    details.code === 'user_already_exists' ||
    message.includes('already registered') ||
    message.includes('already exists')
  );
}

function isUnavailableError(error: unknown): boolean {
  const details = errorDetails(error);

  return (
    (typeof details.status === 'number' && details.status >= 500) ||
    details.code?.startsWith('08') === true ||
    ['57P01', '57P02', '57P03', 'ECONNREFUSED', 'ETIMEDOUT'].includes(
      details.code ?? '',
    )
  );
}
