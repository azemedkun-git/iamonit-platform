import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLIC_CLIENT } from '../../common/supabase/supabase.constants';
import { AuthRepository } from './auth.repository';
import {
  AUTH_ROLES,
  AuthenticatedContext,
  AuthenticatedIdentity,
  AuthRole,
} from './auth.types';

type VerifiedClaims = Record<string, unknown>;

@Injectable()
export class JwtStrategy {
  private readonly repository: AuthRepository;
  private readonly issuer: string;

  constructor(
    @Inject(SUPABASE_PUBLIC_CLIENT)
    private readonly publicClient: SupabaseClient,
    configService: ConfigService,
    @Optional() repository?: AuthRepository,
  ) {
    this.repository =
      repository ??
      new AuthRepository(configService.getOrThrow<string>('databaseUrl'));
    this.issuer = `${configService
      .getOrThrow<string>('supabaseUrl')
      .replace(/\/$/, '')}/auth/v1`;
  }

  async verify(accessToken: string): Promise<AuthenticatedContext> {
    const { userId } = await this.verifyIdentity(accessToken);

    let access;

    try {
      access = await this.repository.findApplicationAccess(userId);
    } catch (error) {
      if (isAvailabilityFailure(error)) {
        throw new ServiceUnavailableException('Database is unavailable.');
      }
      throw new InternalServerErrorException(
        'Authenticated context could not be loaded.',
      );
    }

    if (!access || !access.tenantExists || access.tenantStatus !== 'active') {
      throw new ForbiddenException('Account access is not available.');
    }

    if (
      access.userId !== userId ||
      !isUuid(access.tenantId) ||
      !AUTH_ROLES.includes(access.role as AuthRole)
    ) {
      throw new InternalServerErrorException(
        'Authenticated context could not be loaded.',
      );
    }

    return {
      userId,
      tenantId: access.tenantId,
      role: access.role as AuthRole,
    };
  }

  async verifyIdentity(accessToken: string): Promise<AuthenticatedIdentity> {
    if (typeof accessToken !== 'string' || accessToken.trim() === '') {
      throw this.unauthorized();
    }

    let result: Awaited<ReturnType<SupabaseClient['auth']['getClaims']>>;

    try {
      result = await this.publicClient.auth.getClaims(accessToken);
    } catch (error) {
      if (isAvailabilityFailure(error)) {
        throw new ServiceUnavailableException(
          'Authentication provider is unavailable.',
        );
      }
      throw this.unauthorized();
    }

    if (result.error) {
      if (isAvailabilityFailure(result.error)) {
        throw new ServiceUnavailableException(
          'Authentication provider is unavailable.',
        );
      }
      throw this.unauthorized();
    }

    const claims = result.data?.claims as VerifiedClaims | undefined;
    const userId = this.validateClaims(claims);

    return { userId };
  }

  private validateClaims(claims: VerifiedClaims | undefined): string {
    const now = Math.floor(Date.now() / 1000);
    const audience = claims?.aud;
    const hasAuthenticatedAudience =
      audience === 'authenticated' ||
      (Array.isArray(audience) && audience.includes('authenticated'));

    if (
      !claims ||
      typeof claims.exp !== 'number' ||
      claims.exp <= now ||
      claims.iss !== this.issuer ||
      !hasAuthenticatedAudience ||
      claims.role !== 'authenticated' ||
      !isUuid(claims.sub)
    ) {
      throw this.unauthorized();
    }

    return claims.sub;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException('Invalid authentication credentials.');
  }
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function isAvailabilityFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: unknown; status?: unknown };
  return (
    (typeof candidate.status === 'number' && candidate.status >= 500) ||
    (typeof candidate.code === 'string' &&
      [
        'ECONNREFUSED',
        'ECONNRESET',
        'ENETUNREACH',
        'ETIMEDOUT',
        'EAI_AGAIN',
        '53300',
        '57P01',
        '57P02',
        '57P03',
      ].includes(candidate.code))
  );
}
