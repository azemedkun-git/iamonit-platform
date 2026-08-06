import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [SupabaseModule, JwtStrategy],
})
export class AuthModule {}
