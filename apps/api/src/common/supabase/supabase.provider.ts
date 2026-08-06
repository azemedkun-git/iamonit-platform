import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { FactoryProvider } from '@nestjs/common';
import {
  SUPABASE_ADMIN_CLIENT,
  SUPABASE_PUBLIC_CLIENT,
} from './supabase.constants';

const serverAuthOptions = {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: false,
} as const;

function createSupabaseClient(
  configService: ConfigService,
  keyName: 'supabaseAnonKey' | 'supabaseServiceRoleKey',
): SupabaseClient {
  const url = configService.getOrThrow<string>('supabaseUrl');
  const key = configService.getOrThrow<string>(keyName);

  return createClient(url, key, { auth: serverAuthOptions });
}

export const supabasePublicClientProvider: FactoryProvider<SupabaseClient> = {
  provide: SUPABASE_PUBLIC_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) =>
    createSupabaseClient(configService, 'supabaseAnonKey'),
};

export const supabaseAdminClientProvider: FactoryProvider<SupabaseClient> = {
  provide: SUPABASE_ADMIN_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService) =>
    createSupabaseClient(configService, 'supabaseServiceRoleKey'),
};

export const supabaseClientProviders = [
  supabasePublicClientProvider,
  supabaseAdminClientProvider,
] as const;
