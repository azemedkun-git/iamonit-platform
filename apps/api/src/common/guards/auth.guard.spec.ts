import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtStrategy } from '../../modules/auth/jwt.strategy';
import { AuthenticatedContext } from '../../modules/auth/auth.types';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const token = 'sensitive-access-token';
  const authenticatedContext: AuthenticatedContext = {
    userId: '3d10ad51-1d6c-4dfc-9a12-38337bed3440',
    tenantId: '1aa6f7f9-e3ec-4b32-93ab-5baac785c05f',
    role: 'dispatcher',
  };

  function createSubject(authorization?: unknown) {
    const request: {
      headers: { authorization?: unknown };
      user?: AuthenticatedContext;
    } = { headers: { authorization } };
    const verify = jest.fn<Promise<AuthenticatedContext>, [string]>();
    const verifier = { verify } as unknown as JwtStrategy;
    const executionContext = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    return {
      guard: new AuthGuard(verifier),
      executionContext,
      request,
      verify,
    };
  }

  it.each(['Bearer', 'bearer', 'BEARER'])(
    'passes one token for the case-insensitive %s scheme and populates request.user',
    async (scheme) => {
      const { guard, executionContext, request, verify } = createSubject(
        `${scheme} ${token}`,
      );
      verify.mockResolvedValue(authenticatedContext);

      await expect(guard.canActivate(executionContext)).resolves.toBe(true);

      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(token);
      expect(request.user).toBe(authenticatedContext);
      expect(request.user).toEqual({
        userId: authenticatedContext.userId,
        tenantId: authenticatedContext.tenantId,
        role: authenticatedContext.role,
      });
    },
  );

  it.each([
    ['missing header', undefined],
    ['non-string array header', [`Bearer ${token}`]],
    ['non-string numeric header', 123],
    ['empty header', ''],
    ['empty bearer token', 'Bearer'],
    ['empty bearer token with whitespace', 'Bearer   '],
    ['unsupported scheme', `Basic ${token}`],
    ['missing scheme separator', `Bearer${token}`],
    ['leading whitespace', ` Bearer ${token}`],
    ['trailing whitespace', `Bearer ${token} `],
    ['multiple credentials separated by comma', `Bearer ${token},Bearer second`],
    ['multiple credentials separated by whitespace', `Bearer ${token} second`],
  ])('rejects %s with a safe 401', async (_name, authorization) => {
    const { guard, executionContext, request, verify } =
      createSubject(authorization);

    const error = await guard
      .canActivate(executionContext)
      .catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(JSON.stringify(error)).not.toContain(token);
    expect(verify).not.toHaveBeenCalled();
    expect(request.user).toBeUndefined();
  });

  it.each([
    new UnauthorizedException('Invalid authentication credentials.'),
    new ForbiddenException('Account access is not available.'),
    new InternalServerErrorException(
      'Authenticated context could not be loaded.',
    ),
    new ServiceUnavailableException(
      'Authentication provider is unavailable.',
    ),
  ])('propagates verifier exceptions unchanged', async (error) => {
    const { guard, executionContext, request, verify } = createSubject(
      `Bearer ${token}`,
    );
    verify.mockRejectedValue(error);

    await expect(guard.canActivate(executionContext)).rejects.toBe(error);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(request.user).toBeUndefined();
  });

  it('does not expose credentials or secrets in errors or logs', async () => {
    const sensitive = [
      token,
      'password-value',
      'refresh-token',
      'anonymous-key',
      'service-role-key',
      'jwt-secret',
      'provider-response-body',
      'database-value',
    ];
    const authorization = `Bearer ${sensitive.join(',')}`;
    const consoleSpies = [
      jest.spyOn(console, 'log').mockImplementation(),
      jest.spyOn(console, 'error').mockImplementation(),
      jest.spyOn(console, 'warn').mockImplementation(),
    ];
    const { guard, executionContext, verify } = createSubject(authorization);

    const error = await guard
      .canActivate(executionContext)
      .catch((failure: unknown) => failure);
    const serialized = JSON.stringify(error);

    expect(error).toBeInstanceOf(UnauthorizedException);
    for (const value of sensitive) {
      expect(serialized).not.toContain(value);
    }
    expect(verify).not.toHaveBeenCalled();
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
