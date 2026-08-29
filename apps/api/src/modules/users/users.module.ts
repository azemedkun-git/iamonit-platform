import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    {
      provide: UsersRepository,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new UsersRepository(configService.getOrThrow<string>('databaseUrl')),
    },
  ],
})
export class UsersModule {}
