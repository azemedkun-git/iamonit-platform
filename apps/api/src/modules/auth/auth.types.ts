export const AUTH_ROLES = ["admin", "dispatcher", "car_puller"] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["active", "suspended", "removed"] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface UserProfileRecord {
  userId: string;
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

export interface AuthenticatedIdentity {
  userId: string;
}

export interface TenantRequestContext {
  userId: string;
  membershipId: string;
  tenantId: string;
  role: AuthRole;
}

export interface AuthenticatedContext {
  userId: string;
  tenantId: string;
  role: AuthRole;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  expiresAt: number;
  tokenType: string;
}

export interface AuthUserContext {
  id: string;
  email: string;
  tenantId: string;
  role: AuthRole;
  fullName: string;
  phone: string;
}

export interface AuthResponse {
  session: AuthSession | null;
  requiresEmailConfirmation: boolean;
  user: AuthUserContext;
}

export interface AuthUserProfile extends UserProfileRecord {
  email: string;
}

export interface AuthBootstrapResponse {
  profile: AuthUserProfile;
  memberships: MembershipSummary[];
  selectedMembership: MembershipSummary | null;
}

export interface MultiTenantAuthResponse {
  session: AuthSession | null;
  requiresEmailConfirmation: boolean;
  profile: AuthUserProfile;
  memberships: MembershipSummary[];
  selectedMembership: MembershipSummary | null;
}
