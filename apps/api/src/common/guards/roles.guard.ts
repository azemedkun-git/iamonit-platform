import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import {
  AUTH_ROLES,
  AuthenticatedContext,
  AuthRole,
} from '../../modules/auth/auth.types';

interface RoleProtectedRequest {
  user?: unknown;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<AuthRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RoleProtectedRequest>();
    const user = request.user;

    if (!this.isAuthenticatedContext(user)) {
      throw new UnauthorizedException('Authentication is required.');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    return true;
  }

  private isAuthenticatedContext(value: unknown): value is AuthenticatedContext {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<AuthenticatedContext>;
    return (
      typeof candidate.userId === 'string' &&
      candidate.userId.length > 0 &&
      typeof candidate.tenantId === 'string' &&
      candidate.tenantId.length > 0 &&
      typeof candidate.role === 'string' &&
      (AUTH_ROLES as readonly string[]).includes(candidate.role)
    );
  }
}
