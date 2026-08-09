import { ApiProperty } from '@nestjs/swagger';
import {
  AUTH_ROLES,
  MEMBERSHIP_STATUSES,
  AuthResponse,
  AuthRole,
  AuthSession,
  AuthUserContext,
  MembershipStatus,
  MembershipSummary,
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

export class UserProfileDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  phone: string;

  constructor(profile: UserProfileDto) {
    Object.assign(this, profile);
  }
}

export class MembershipSummaryDto implements MembershipSummary {
  @ApiProperty()
  membershipId: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  tenantName: string;

  @ApiProperty({ enum: AUTH_ROLES })
  role: AuthRole;

  @ApiProperty({ enum: MEMBERSHIP_STATUSES })
  status: MembershipStatus;

  constructor(membership: MembershipSummary) {
    Object.assign(this, membership);
  }
}

export class MultiTenantAuthResponseDto {
  @ApiProperty({ type: AuthSessionDto, nullable: true })
  session: AuthSessionDto | null;

  @ApiProperty()
  requiresEmailConfirmation: boolean;

  @ApiProperty({ type: UserProfileDto })
  profile: UserProfileDto;

  @ApiProperty({ type: [MembershipSummaryDto] })
  memberships: MembershipSummaryDto[];

  @ApiProperty({ type: MembershipSummaryDto, nullable: true })
  selectedMembership: MembershipSummaryDto | null;

  constructor(response: {
    session: AuthSession | null;
    requiresEmailConfirmation: boolean;
    profile: UserProfileDto;
    memberships: MembershipSummary[];
    selectedMembership: MembershipSummary | null;
  }) {
    this.session = response.session
      ? new AuthSessionDto(response.session)
      : null;
    this.requiresEmailConfirmation = response.requiresEmailConfirmation;
    this.profile = new UserProfileDto(response.profile);
    this.memberships = response.memberships.map(
      (membership) => new MembershipSummaryDto(membership),
    );
    this.selectedMembership = response.selectedMembership
      ? new MembershipSummaryDto(response.selectedMembership)
      : null;
  }
}
