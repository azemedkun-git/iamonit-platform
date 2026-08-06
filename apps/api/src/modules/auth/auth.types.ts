export const AUTH_ROLES = ['admin', 'dispatcher', 'car_puller'] as const;

export type AuthRole = (typeof AUTH_ROLES)[number];

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

