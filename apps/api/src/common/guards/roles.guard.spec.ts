import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Roles } from '../decorators/roles.decorator';
import { AuthRole, TenantRequestContext } from '../../modules/auth/auth.types';
import { RolesGuard } from './roles.guard';

describe('Roles', () => {
  it('stores typed role metadata for one role', () => {
    @Roles('admin')
    class AdminOnlyController {}

    expect(Reflect.getMetadata(ROLES_KEY, AdminOnlyController)).toEqual([
      'admin',
    ]);
  });

  it('stores multiple allowed roles', () => {
    class TestController {
      @Roles('dispatcher', 'car_puller')
      handle() {}
    }

    expect(
      Reflect.getMetadata(ROLES_KEY, TestController.prototype.handle),
    ).toEqual(['dispatcher', 'car_puller']);
  });
});

describe('RolesGuard', () => {
  function createSubject(options: {
    classRoles?: AuthRole[];
    handlerRoles?: AuthRole[];
    user?: unknown;
  }) {
    class TestController {
      handle() {}
    }

    if (options.classRoles) {
      Reflect.defineMetadata(ROLES_KEY, options.classRoles, TestController);
    }
    if (options.handlerRoles) {
      Reflect.defineMetadata(
        ROLES_KEY,
        options.handlerRoles,
        TestController.prototype.handle,
      );
    }

    const request = { user: options.user };
    const context = {
      getHandler: () => TestController.prototype.handle,
      getClass: () => TestController,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    return {
      guard: new RolesGuard(new Reflector()),
      context,
      request,
    };
  }

  function authenticatedUser(role: AuthRole): TenantRequestContext {
    return {
      userId: '3d10ad51-1d6c-4dfc-9a12-38337bed3440',
      membershipId: '2aa6f7f9-e3ec-4b32-93ab-5baac785c05f',
      tenantId: '1aa6f7f9-e3ec-4b32-93ab-5baac785c05f',
      role,
    };
  }

  it('allows a request when no role metadata exists', () => {
    const { guard, context } = createSubject({});

    expect(guard.canActivate(context)).toBe(true);
  });

  it.each<AuthRole>(['admin', 'dispatcher', 'car_puller'])(
    'allows the matching %s method-level role',
    (role) => {
      const user = authenticatedUser(role);
      const { guard, context, request } = createSubject({
        handlerRoles: [role],
        user,
      });

      expect(guard.canActivate(context)).toBe(true);
      expect(request.user).toBe(user);
    },
  );

  it('allows a matching class-level role', () => {
    const { guard, context } = createSubject({
      classRoles: ['dispatcher'],
      user: authenticatedUser('dispatcher'),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a role matching one of multiple allowed roles', () => {
    const { guard, context } = createSubject({
      handlerRoles: ['admin', 'car_puller'],
      user: authenticatedUser('car_puller'),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('uses handler-level metadata instead of class-level metadata', () => {
    const { guard, context } = createSubject({
      classRoles: ['admin'],
      handlerRoles: ['dispatcher'],
      user: authenticatedUser('dispatcher'),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('returns 403 when the authenticated user has the wrong role', () => {
    const { guard, context } = createSubject({
      handlerRoles: ['admin'],
      user: authenticatedUser('dispatcher'),
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it.each([
    ['missing user', undefined],
    ['missing userId', { tenantId: 'tenant-id', role: 'admin' }],
    [
      'missing membershipId',
      { userId: 'user-id', tenantId: 'tenant-id', role: 'admin' },
    ],
    ['missing tenantId', { userId: 'user-id', role: 'admin' }],
    [
      'unsupported role',
      { userId: 'user-id', tenantId: 'tenant-id', role: 'owner' },
    ],
  ])('returns 401 for %s authenticated context', (_name, user) => {
    const { guard, context } = createSubject({
      handlerRoles: ['admin'],
      user,
    });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
