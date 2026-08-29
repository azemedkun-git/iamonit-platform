import {
  AuthRole,
  MembershipStatus,
} from '../auth/auth.types';

export interface TenantUser {
  userId: string;
  membershipId: string;
  email: string;
  fullName: string;
  phone: string;
  role: AuthRole;
  status: MembershipStatus;
}
