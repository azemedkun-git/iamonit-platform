import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtStrategy } from '../../modules/auth/jwt.strategy';
import { AuthenticatedContext } from '../../modules/auth/auth.types';

interface AuthenticatedRequest {
  headers: {
    authorization?: unknown;
  };
  user?: AuthenticatedContext;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly tokenVerifier: JwtStrategy) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken = this.extractAccessToken(request.headers.authorization);
    const authenticatedContext = await this.tokenVerifier.verify(accessToken);

    request.user = authenticatedContext;
    return true;
  }

  private extractAccessToken(authorization: unknown): string {
    if (typeof authorization !== 'string') {
      throw this.unauthorized();
    }

    const match = /^Bearer +([^\s,]+)$/i.exec(authorization);
    if (!match) {
      throw this.unauthorized();
    }

    return match[1];
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException('Invalid authentication credentials.');
  }
}
