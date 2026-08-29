import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TenantRequestContext } from '../auth/auth.types';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';
import { TenantUser } from './users.types';

describe('UsersService', () => {
  const context: TenantRequestContext = {
    userId: '11111111-1111-4111-8111-111111111111',
    membershipId: '22222222-2222-4222-8222-222222222222',
    tenantId: '33333333-3333-4333-8333-333333333333',
    role: 'admin',
  };

  function createService(result: TenantUser[] = []) {
    const repository = {
      findActiveUsersByTenantId: jest.fn().mockResolvedValue(result),
    } as unknown as UsersRepository;
    return { repository, service: new UsersService(repository) };
  }

  it('delegates once using only the verified context tenantId', async () => {
    const users: TenantUser[] = [
      {
        userId: '44444444-4444-4444-8444-444444444444',
        membershipId: '55555555-5555-4555-8555-555555555555',
        email: 'dispatcher@example.com',
        fullName: 'Dana Dispatcher',
        phone: '+13125550101',
        role: 'dispatcher',
        status: 'active',
      },
    ];
    const { repository, service } = createService(users);

    await expect(service.listTenantUsers(context)).resolves.toBe(users);
    expect(repository.findActiveUsersByTenantId).toHaveBeenCalledTimes(1);
    expect(repository.findActiveUsersByTenantId).toHaveBeenCalledWith(
      context.tenantId,
    );
    expect(service.listTenantUsers.length).toBe(1);
  });

  it('returns an empty repository result unchanged', async () => {
    const { service } = createService([]);

    await expect(service.listTenantUsers(context)).resolves.toEqual([]);
  });

  it('preserves the tenant-specific membership role', async () => {
    const users: TenantUser[] = [
      {
        userId: '44444444-4444-4444-8444-444444444444',
        membershipId: '66666666-6666-4666-8666-666666666666',
        email: 'puller@example.com',
        fullName: 'Casey Puller',
        phone: '+13125550102',
        role: 'car_puller',
        status: 'active',
      },
    ];
    const { service } = createService(users);

    await expect(service.listTenantUsers(context)).resolves.toEqual(users);
  });

  it('maps database availability failures to a safe 503', async () => {
    const { repository, service } = createService();
    (repository.findActiveUsersByTenantId as jest.Mock).mockRejectedValue({
      code: 'ECONNREFUSED',
      detail: 'postgresql://secret',
    });

    const error = await service.listTenantUsers(context).catch((value) => value);

    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toBe('Database is unavailable.');
    expect(JSON.stringify(error)).not.toContain('postgresql://secret');
  });

  it('maps unexpected database failures to a safe 500', async () => {
    const { repository, service } = createService();
    (repository.findActiveUsersByTenantId as jest.Mock).mockRejectedValue(
      new Error('SELECT secret FROM internal_table'),
    );

    const error = await service.listTenantUsers(context).catch((value) => value);

    expect(error).toBeInstanceOf(InternalServerErrorException);
    expect(error.message).toBe('Users could not be loaded.');
    expect(JSON.stringify(error)).not.toContain('SELECT secret');
  });

  it('preserves already-safe application exceptions', async () => {
    const safeError = new ServiceUnavailableException(
      'Database is unavailable.',
    );
    const { repository, service } = createService();
    (repository.findActiveUsersByTenantId as jest.Mock).mockRejectedValue(
      safeError,
    );

    await expect(service.listTenantUsers(context)).rejects.toBe(safeError);
  });
});
