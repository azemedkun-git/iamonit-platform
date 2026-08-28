import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextGuard } from '../../common/guards/tenant-context.guard';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [SupabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    AuthGuard,
    TenantContextGuard,
    RolesGuard,
    {
      provide: AuthRepository,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new AuthRepository(configService.getOrThrow<string>('databaseUrl')),
    },
  ],
  exports: [
    SupabaseModule,
    JwtStrategy,
    AuthGuard,
    TenantContextGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
