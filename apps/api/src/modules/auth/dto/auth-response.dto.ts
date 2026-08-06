import { ApiProperty } from '@nestjs/swagger';
import {
  AUTH_ROLES,
  AuthResponse,
  AuthRole,
  AuthSession,
  AuthUserContext,
} from '../auth.types';

export class AuthSessionDto implements AuthSession {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  refreshToken: string;

  @ApiProperty()
  expiresIn: number;

  @ApiProperty()
  expiresAt: number;

  @ApiProperty()
  tokenType: string;

  constructor(session: AuthSession) {
    Object.assign(this, session);
  }
}

export class AuthUserDto implements AuthUserContext {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty({ enum: AUTH_ROLES })
  role: AuthRole;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  phone: string;

  constructor(user: AuthUserContext) {
    Object.assign(this, user);
  }
}

export class AuthResponseDto implements AuthResponse {
  @ApiProperty({ type: AuthSessionDto, nullable: true })
  session: AuthSessionDto | null;

  @ApiProperty()
  requiresEmailConfirmation: boolean;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;

  constructor(response: AuthResponse) {
    this.session = response.session
      ? new AuthSessionDto(response.session)
      : null;
    this.requiresEmailConfirmation = response.requiresEmailConfirmation;
    this.user = new AuthUserDto(response.user);
  }
}

