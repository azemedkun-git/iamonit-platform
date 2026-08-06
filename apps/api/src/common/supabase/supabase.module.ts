import { Module } from '@nestjs/common';
import { supabaseClientProviders } from './supabase.provider';

@Module({
  providers: [...supabaseClientProviders],
  exports: [...supabaseClientProviders],
})
export class SupabaseModule {}
