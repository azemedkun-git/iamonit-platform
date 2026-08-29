import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantRequestContext } from '../auth/auth.types';
import { UsersRepository } from './users.repository';
import { TenantUser } from './users.types';

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async listTenantUsers(context: TenantRequestContext): Promise<TenantUser[]> {
    try {
      return await this.repository.findActiveUsersByTenantId(context.tenantId);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (isAvailabilityFailure(error)) {
        throw new ServiceUnavailableException('Database is unavailable.');
      }
      throw new InternalServerErrorException('Users could not be loaded.');
    }
  }
}

function isAvailabilityFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: unknown; status?: unknown };
  return (
    (typeof candidate.status === 'number' && candidate.status >= 500) ||
    (typeof candidate.code === 'string' &&
      [
        'ECONNREFUSED',
        'ECONNRESET',
        'ENETUNREACH',
        'ETIMEDOUT',
        'EAI_AGAIN',
        '53300',
        '57P01',
        '57P02',
        '57P03',
      ].includes(candidate.code))
  );
}
