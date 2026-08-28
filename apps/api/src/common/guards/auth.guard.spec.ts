import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtStrategy } from '../../modules/auth/jwt.strategy';
import { AuthenticatedIdentity } from '../../modules/auth/auth.types';
import { AuthGuard } from './auth.guard';

describe('AuthGuard', () => {
  const token = 'sensitive-access-token';
  const authenticatedIdentity: AuthenticatedIdentity = {
    userId: '3d10ad51-1d6c-4dfc-9a12-38337bed3440',
  };

  function createSubject(authorization?: unknown) {
    const request: {
      headers: { authorization?: unknown };
      user?: AuthenticatedIdentity;
    } = { headers: { authorization } };
    const verifyIdentity = jest.fn<Promise<AuthenticatedIdentity>, [string]>();
    const verify = jest.fn();
    const verifier = { verifyIdentity, verify } as unknown as JwtStrategy;
    const executionContext = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    return {
      guard: new AuthGuard(verifier),
      executionContext,
      request,
      verifyIdentity,
      verify,
    };
  }

  it.each(['Bearer', 'bearer', 'BEARER'])(
    'passes one token for the case-insensitive %s scheme and populates request.user',
    async (scheme) => {
      const { guard, executionContext, request, verifyIdentity, verify } =
        createSubject(`${scheme} ${token}`);
      verifyIdentity.mockResolvedValue(authenticatedIdentity);

      await expect(guard.canActivate(executionContext)).resolves.toBe(true);

      expect(verifyIdentity).toHaveBeenCalledTimes(1);
      expect(verifyIdentity).toHaveBeenCalledWith(token);
      expect(request.user).toEqual({
        userId: authenticatedIdentity.userId,
      });
      expect(request.user).not.toHaveProperty('tenantId');
      expect(request.user).not.toHaveProperty('membershipId');
      expect(request.user).not.toHaveProperty('role');
      expect(verify).not.toHaveBeenCalled();
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
    const { guard, executionContext, request, verifyIdentity } =
      createSubject(authorization);

    const error = await guard
      .canActivate(executionContext)
      .catch((failure: unknown) => failure);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(JSON.stringify(error)).not.toContain(token);
    expect(verifyIdentity).not.toHaveBeenCalled();
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
    const { guard, executionContext, request, verifyIdentity } = createSubject(
      `Bearer ${token}`,
    );
    verifyIdentity.mockRejectedValue(error);

    await expect(guard.canActivate(executionContext)).rejects.toBe(error);
    expect(verifyIdentity).toHaveBeenCalledTimes(1);
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
    const { guard, executionContext, verifyIdentity } =
      createSubject(authorization);

    const error = await guard
      .canActivate(executionContext)
      .catch((failure: unknown) => failure);
    const serialized = JSON.stringify(error);

    expect(error).toBeInstanceOf(UnauthorizedException);
    for (const value of sensitive) {
      expect(serialized).not.toContain(value);
    }
    expect(verifyIdentity).not.toHaveBeenCalled();
    for (const spy of consoleSpies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});
