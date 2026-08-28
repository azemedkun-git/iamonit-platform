import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthRepository } from '../../modules/auth/auth.repository';
import { JwtStrategy } from '../../modules/auth/jwt.strategy';
import { AuthRole, MembershipSummary } from '../../modules/auth/auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { TenantContextGuard } from './tenant-context.guard';

describe('TenantContextGuard', () => {
  const userId = '3d10ad51-1d6c-4dfc-9a12-38337bed3440';
  const tenantId = '1aa6f7f9-e3ec-4b32-93ab-5baac785c05f';
  const membershipId = '2aa6f7f9-e3ec-4b32-93ab-5baac785c05f';

  function membership(role: AuthRole = 'dispatcher'): MembershipSummary {
    return {
      membershipId,
      tenantId,
      tenantName: 'Verified tenant',
      role,
      status: 'active',
    };
  }

  function createSubject(header: unknown = tenantId, user: unknown = { userId }) {
    const request = {
      headers: { 'x-iamonit-tenant-id': header },
      user,
    };
    const findActiveMembership = jest.fn();
    const repository = { findActiveMembership } as unknown as AuthRepository;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return {
      guard: new TenantContextGuard(repository),
      context,
      request,
      findActiveMembership,
    };
  }

  it('rejects a request without an authenticated identity', async () => {
    const { guard, context } = createSubject(tenantId, null);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it.each([
    ['missing', null],
    ['blank', '   '],
    ['malformed UUID', 'not-a-uuid'],
    ['multiple values', [tenantId, tenantId]],
  ])('rejects a %s tenant header', async (_name, header) => {
    const { guard, context, findActiveMembership } = createSubject(header);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findActiveMembership).not.toHaveBeenCalled();
  });

  it.each<AuthRole>(['admin', 'dispatcher', 'car_puller'])(
    'attaches the verified %s membership context',
    async (role) => {
      const { guard, context, request, findActiveMembership } = createSubject();
      findActiveMembership.mockResolvedValue(membership(role));

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(findActiveMembership).toHaveBeenCalledWith(userId, tenantId);
      expect(request.user).toEqual({ userId, membershipId, tenantId, role });
    },
  );

  it.each([
    'different tenant/no membership',
    'suspended membership',
    'removed membership',
    'suspended tenant',
    'archived tenant',
  ])('forbids %s when the repository returns no active membership', async () => {
    const { guard, context, findActiveMembership } = createSubject();
    findActiveMembership.mockResolvedValue(null);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('maps database unavailability to a safe 503', async () => {
    const { guard, context, findActiveMembership } = createSubject();
    findActiveMembership.mockRejectedValue(
      Object.assign(new Error('database URL and SQL'), { code: 'ECONNREFUSED' }),
    );
    const error = await guard.canActivate(context).catch((value) => value);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(JSON.stringify(error)).not.toContain('database URL and SQL');
  });

  it('maps unexpected repository errors to a safe 500', async () => {
    const { guard, context, findActiveMembership } = createSubject();
    findActiveMembership.mockRejectedValue(new Error('SELECT secret'));
    const error = await guard.canActivate(context).catch((value) => value);
    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(JSON.stringify(error)).not.toContain('SELECT secret');
  });
});

describe('identity, tenant context, and role guard chaining', () => {
  it('authorizes the same identity with the role verified for each requested tenant', async () => {
    const userId = '3d10ad51-1d6c-4dfc-9a12-38337bed3440';
    const tenants = [
      {
        tenantId: '1aa6f7f9-e3ec-4b32-93ab-5baac785c05f',
        membershipId: '2aa6f7f9-e3ec-4b32-93ab-5baac785c05f',
        role: 'admin' as const,
      },
      {
        tenantId: '4aa6f7f9-e3ec-4b32-93ab-5baac785c05f',
        membershipId: '5aa6f7f9-e3ec-4b32-93ab-5baac785c05f',
        role: 'dispatcher' as const,
      },
    ];
    const verifyIdentity = jest.fn().mockResolvedValue({ userId });
    const authGuard = new AuthGuard({ verifyIdentity } as unknown as JwtStrategy);

    for (const tenant of tenants) {
      class Controller {
        handle() {}
      }
      Reflect.defineMetadata(
        ROLES_KEY,
        [tenant.role],
        Controller.prototype.handle,
      );
      const request: { headers: Record<string, unknown>; user?: unknown } = {
        headers: {
          authorization: 'Bearer access-token',
          'x-iamonit-tenant-id': tenant.tenantId,
        },
      };
      const context = {
        getHandler: () => Controller.prototype.handle,
        getClass: () => Controller,
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;
      const findActiveMembership = jest.fn().mockResolvedValue({
        ...tenant,
        tenantName: 'Verified tenant',
        status: 'active',
      });
      const tenantGuard = new TenantContextGuard({
        findActiveMembership,
      } as unknown as AuthRepository);
      const rolesGuard = new RolesGuard(new Reflector());

      await expect(authGuard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({ userId });
      await expect(tenantGuard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toEqual({ userId, ...tenant });
      expect(rolesGuard.canActivate(context)).toBe(true);
    }

    expect(verifyIdentity).toHaveBeenCalledTimes(2);
  });
});
