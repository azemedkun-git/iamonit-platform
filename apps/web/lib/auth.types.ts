export type AuthRole = 'admin' | 'dispatcher' | 'car_puller';

export type MembershipStatus = 'active' | 'suspended' | 'removed';

export interface RegisterTransporterRequest {
  email: string;
  password: string;
  companyName: string;
  fullName: string;
  phone: string;
}

export interface RegisterCarPullerRequest {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
  tokenType: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
}

export interface MembershipSummary {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  role: AuthRole;
  status: MembershipStatus;
}

export interface MultiTenantAuthResponse {
  session: AuthSession | null;
  requiresEmailConfirmation: boolean;
  profile: UserProfile;
  memberships: MembershipSummary[];
  selectedMembership: MembershipSummary | null;
}
