import type {
  AuthResponse,
  AuthRole,
  LoginRequest,
  RegisterRequest,
} from './auth.types';

const CONFIGURATION_ERROR = 'The service is not configured.';
const REQUEST_ERROR = 'The request could not be completed. Please try again.';
const RESPONSE_ERROR = 'The service returned an unexpected response.';

const SAFE_HTTP_MESSAGES = new Map<number, ReadonlySet<string>>([
  [401, new Set(['Invalid email or password.'])],
  [403, new Set(['Account access is not configured.'])],
  [409, new Set([
    'An account with this email already exists.',
    'A company with this name already exists.',
  ])],
  [500, new Set([
    'Registration could not be completed.',
    'Login could not be completed.',
  ])],
  [503, new Set([
    'Authentication provider is unavailable.',
    'Database is unavailable.',
  ])],
]);

const AUTH_ROLES: readonly AuthRole[] = [
  'admin',
  'dispatcher',
  'car_puller',
];

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface AuthRequestOptions {
  accessToken?: string;
}

export function normalizeApiBaseUrl(configuredUrl: string | undefined): string {
  if (!configuredUrl) {
    throw new ApiError(0, CONFIGURATION_ERROR);
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new ApiError(0, CONFIGURATION_ERROR);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new ApiError(0, CONFIGURATION_ERROR);
  }

  return url.toString().replace(/\/+$/, '');
}

export function register(
  input: RegisterRequest,
  options?: AuthRequestOptions,
): Promise<AuthResponse> {
  return requestAuth('/auth/register', input, options);
}

export function login(
  input: LoginRequest,
  options?: AuthRequestOptions,
): Promise<AuthResponse> {
  return requestAuth('/auth/login', input, options);
}

async function requestAuth(
  path: '/auth/register' | '/auth/login',
  body: RegisterRequest | LoginRequest,
  options?: AuthRequestOptions,
): Promise<AuthResponse> {
  const baseUrl = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  const headers = new Headers({ 'Content-Type': 'application/json' });

  if (options?.accessToken) {
    headers.set('Authorization', `Bearer ${options.accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, REQUEST_ERROR);
  }

  if (!isJsonResponse(response)) {
    throw new ApiError(response.status, RESPONSE_ERROR);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(response.status, RESPONSE_ERROR);
  }

  if (!response.ok) {
    throw safeHttpError(response.status, payload);
  }

  if (!isAuthResponse(payload)) {
    throw new ApiError(response.status, RESPONSE_ERROR);
  }

  return payload;
}

function safeHttpError(status: number, payload: unknown): ApiError {
  if (!isPlainObject(payload) || !hasOnlyErrorKeys(payload)) {
    return new ApiError(status, REQUEST_ERROR);
  }

  const message = payload.message;
  const approvedMessages = SAFE_HTTP_MESSAGES.get(status);
  return new ApiError(
    status,
    typeof message === 'string' && approvedMessages?.has(message)
      ? message
      : REQUEST_ERROR,
  );
}

function hasOnlyErrorKeys(value: Record<string, unknown>): boolean {
  const approvedKeys = new Set(['statusCode', 'message', 'error']);
  return Object.keys(value).every((key) => approvedKeys.has(key));
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get('content-type');
  return contentType?.toLowerCase().includes('application/json') ?? false;
}

function isAuthResponse(value: unknown): value is AuthResponse {
  if (!isPlainObject(value)) {
    return false;
  }

  return (
    hasExactKeys(value, ['session', 'requiresEmailConfirmation', 'user']) &&
    typeof value.requiresEmailConfirmation === 'boolean' &&
    isAuthUser(value.user) &&
    (value.session === null || isAuthSession(value.session))
  );
}

function isAuthSession(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, [
      'accessToken',
      'refreshToken',
      'expiresIn',
      'expiresAt',
      'tokenType',
    ]) &&
    isString(value.accessToken) &&
    isString(value.refreshToken) &&
    isFiniteNumber(value.expiresIn) &&
    isFiniteNumber(value.expiresAt) &&
    isString(value.tokenType)
  );
}

function isAuthUser(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, [
      'id',
      'email',
      'tenantId',
      'role',
      'fullName',
      'phone',
    ]) &&
    isString(value.id) &&
    isString(value.email) &&
    isString(value.tenantId) &&
    typeof value.role === 'string' &&
    AUTH_ROLES.includes(value.role as AuthRole) &&
    isString(value.fullName) &&
    isString(value.phone)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
