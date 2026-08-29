import type {
  AuthRole,
  LoginRequest,
  MembershipStatus,
  MultiTenantAuthResponse,
  RegisterCarPullerRequest,
  RegisterTransporterRequest,
} from './auth.types';

const CONFIGURATION_ERROR = 'The service is not configured.';
const REQUEST_ERROR = 'The request could not be completed. Please try again.';
const RESPONSE_ERROR = 'The service returned an unexpected response.';

const SAFE_HTTP_MESSAGES = new Map<number, ReadonlySet<string>>([
  [401, new Set(['Invalid email or password.'])],
  [409, new Set(['An account with this email already exists.'])],
  [500, new Set(['Registration could not be completed.', 'Login could not be completed.'])],
  [503, new Set(['Authentication provider is unavailable.', 'Database is unavailable.'])],
]);

const AUTH_ROLES: readonly AuthRole[] = ['admin', 'dispatcher', 'car_puller'];
const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = ['active', 'suspended', 'removed'];

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function normalizeApiBaseUrl(configuredUrl: string | undefined): string {
  if (!configuredUrl) throw new ApiError(0, CONFIGURATION_ERROR);
  let url: URL;
  try { url = new URL(configuredUrl); } catch { throw new ApiError(0, CONFIGURATION_ERROR); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ApiError(0, CONFIGURATION_ERROR);
  }
  return url.toString().replace(/\/+$/, '');
}

export function registerTransporter(input: RegisterTransporterRequest): Promise<MultiTenantAuthResponse> {
  return requestAuth('/auth/register/transporter', input);
}

export function registerCarPuller(input: RegisterCarPullerRequest): Promise<MultiTenantAuthResponse> {
  return requestAuth('/auth/register/car-puller', input);
}

export function loginMultiTenant(input: LoginRequest): Promise<MultiTenantAuthResponse> {
  return requestAuth('/auth/login/multi-tenant', input);
}

async function requestAuth(
  path: '/auth/register/transporter' | '/auth/register/car-puller' | '/auth/login/multi-tenant',
  body: RegisterTransporterRequest | RegisterCarPullerRequest | LoginRequest,
): Promise<MultiTenantAuthResponse> {
  const baseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
  } catch { throw new ApiError(0, REQUEST_ERROR); }
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new ApiError(response.status, RESPONSE_ERROR);
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new ApiError(response.status, RESPONSE_ERROR); }
  if (!response.ok) throw safeHttpError(response.status, payload);
  if (!isMultiTenantAuthResponse(payload)) throw new ApiError(response.status, RESPONSE_ERROR);
  return payload;
}

function safeHttpError(status: number, payload: unknown): ApiError {
  if (!isPlainObject(payload) || !Object.keys(payload).every((key) => ['statusCode', 'message', 'error'].includes(key))) {
    return new ApiError(status, REQUEST_ERROR);
  }
  const approved = SAFE_HTTP_MESSAGES.get(status);
  return new ApiError(status, typeof payload.message === 'string' && approved?.has(payload.message) ? payload.message : REQUEST_ERROR);
}

function isMultiTenantAuthResponse(value: unknown): value is MultiTenantAuthResponse {
  if (!isPlainObject(value) || !hasExactKeys(value, ['session', 'requiresEmailConfirmation', 'profile', 'memberships', 'selectedMembership'])) return false;
  if (typeof value.requiresEmailConfirmation !== 'boolean' || !isProfile(value.profile) || !Array.isArray(value.memberships) || !value.memberships.every(isMembership)) return false;
  if (value.session !== null && !isSession(value.session)) return false;
  if (value.selectedMembership === null) return true;
  if (!isMembership(value.selectedMembership)) return false;
  const selectedMembership = value.selectedMembership;
  return value.memberships.some((membership) => sameMembership(membership, selectedMembership));
}

function isSession(value: unknown): boolean {
  return isPlainObject(value) && hasExactKeys(value, ['accessToken', 'refreshToken', 'expiresIn', 'expiresAt', 'tokenType']) &&
    typeof value.accessToken === 'string' && typeof value.refreshToken === 'string' &&
    typeof value.expiresIn === 'number' && Number.isFinite(value.expiresIn) &&
    typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt) && typeof value.tokenType === 'string';
}

function isProfile(value: unknown): boolean {
  return isPlainObject(value) && hasExactKeys(value, ['userId', 'email', 'fullName', 'phone']) &&
    Object.values(value).every((item) => typeof item === 'string');
}

function isMembership(value: unknown): value is MultiTenantAuthResponse['memberships'][number] {
  return isPlainObject(value) && hasExactKeys(value, ['membershipId', 'tenantId', 'tenantName', 'role', 'status']) &&
    typeof value.membershipId === 'string' && typeof value.tenantId === 'string' && typeof value.tenantName === 'string' &&
    typeof value.role === 'string' && AUTH_ROLES.includes(value.role as AuthRole) &&
    typeof value.status === 'string' && MEMBERSHIP_STATUSES.includes(value.status as MembershipStatus);
}

function sameMembership(left: MultiTenantAuthResponse['memberships'][number], right: MultiTenantAuthResponse['memberships'][number]): boolean {
  return left.membershipId === right.membershipId && left.tenantId === right.tenantId && left.tenantName === right.tenantName && left.role === right.role && left.status === right.status;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
