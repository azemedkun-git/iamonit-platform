import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthRepository } from '../../modules/auth/auth.repository';
import {
  AUTH_ROLES,
  AuthenticatedIdentity,
  AuthRole,
  TenantRequestContext,
} from '../../modules/auth/auth.types';

interface TenantContextRequest {
  headers: Record<string, unknown>;
  user?: AuthenticatedIdentity | TenantRequestContext;
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly repository: AuthRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantContextRequest>();
    const identity = request.user;

    if (!this.isAuthenticatedIdentity(identity)) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const tenantId = this.readTenantId(request.headers['x-iamonit-tenant-id']);
    let membership;

    try {
      membership = await this.repository.findActiveMembership(
        identity.userId,
        tenantId,
      );
    } catch (error) {
      if (isAvailabilityFailure(error)) {
        throw new ServiceUnavailableException('Database is unavailable.');
      }
      throw new InternalServerErrorException(
        'Tenant authorization could not be verified.',
      );
    }

    if (!membership) {
      throw new ForbiddenException('Tenant access is not available.');
    }

    if (
      membership.tenantId !== tenantId ||
      !isUuid(membership.membershipId) ||
      !AUTH_ROLES.includes(membership.role as AuthRole) ||
      membership.status !== 'active'
    ) {
      throw new InternalServerErrorException(
        'Tenant authorization could not be verified.',
      );
    }

    request.user = {
      userId: identity.userId,
      membershipId: membership.membershipId,
      tenantId: membership.tenantId,
      role: membership.role,
    };
    return true;
  }

  private isAuthenticatedIdentity(value: unknown): value is AuthenticatedIdentity {
    return (
      !!value &&
      typeof value === 'object' &&
      isUuid((value as Partial<AuthenticatedIdentity>).userId)
    );
  }

  private readTenantId(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '' || !isUuid(value)) {
      throw new BadRequestException('A valid tenant identifier is required.');
    }
    return value;
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
