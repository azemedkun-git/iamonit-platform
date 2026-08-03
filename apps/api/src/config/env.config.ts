export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;

export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export interface ApiEnvironment {
  PORT: number;
  NODE_ENV: NodeEnvironment;
  DATABASE_URL: string;
  JWT_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface ApiConfig {
  port: number;
  nodeEnv: NodeEnvironment;
  databaseUrl: string;
  jwtSecret: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
}

const REQUIRED_VALUES = [
  'DATABASE_URL',
  'JWT_SECRET',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function requiredString(
  environment: Record<string, unknown>,
  name: (typeof REQUIRED_VALUES)[number],
  errors: string[],
): string {
  const value = environment[name];

  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${name} is required and must not be empty`);
    return '';
  }

  return value.trim();
}

function hasAllowedProtocol(
  value: string,
  protocols: readonly string[],
): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): ApiEnvironment {
  const errors: string[] = [];
  const portValue = environment.PORT ?? '4000';
  const portText = String(portValue).trim();
  const port = /^\d+$/.test(portText) ? Number(portText) : Number.NaN;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535');
  }

  const nodeEnvValue = environment.NODE_ENV ?? 'development';
  const nodeEnv = String(nodeEnvValue).trim();

  if (!NODE_ENVIRONMENTS.includes(nodeEnv as NodeEnvironment)) {
    errors.push(`NODE_ENV must be one of: ${NODE_ENVIRONMENTS.join(', ')}`);
  }

  const databaseUrl = requiredString(environment, 'DATABASE_URL', errors);
  const jwtSecret = requiredString(environment, 'JWT_SECRET', errors);
  const supabaseUrl = requiredString(environment, 'SUPABASE_URL', errors);
  const supabaseAnonKey = requiredString(
    environment,
    'SUPABASE_ANON_KEY',
    errors,
  );
  const supabaseServiceRoleKey = requiredString(
    environment,
    'SUPABASE_SERVICE_ROLE_KEY',
    errors,
  );

  if (
    databaseUrl &&
    !hasAllowedProtocol(databaseUrl, ['postgres:', 'postgresql:'])
  ) {
    errors.push('DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (supabaseUrl && !hasAllowedProtocol(supabaseUrl, ['http:', 'https:'])) {
    errors.push('SUPABASE_URL must be a valid HTTP or HTTPS URL');
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid API environment configuration:\n- ${errors.join('\n- ')}`,
    );
  }

  return {
    PORT: port,
    NODE_ENV: nodeEnv as NodeEnvironment,
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: supabaseAnonKey,
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceRoleKey,
  };
}

export default (): ApiConfig => {
  const environment = validateEnvironment(process.env);

  return {
    port: environment.PORT,
    nodeEnv: environment.NODE_ENV,
    databaseUrl: environment.DATABASE_URL,
    jwtSecret: environment.JWT_SECRET,
    supabaseUrl: environment.SUPABASE_URL,
    supabaseAnonKey: environment.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY,
  };
};
