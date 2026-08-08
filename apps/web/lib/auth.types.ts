export type AuthRole = 'admin' | 'dispatcher' | 'car_puller';

export interface RegisterRequest {
  email: string;
  password: string;
  companyName: string;
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
