import { AuthRepository } from './auth.repository';

describe('AuthRepository', () => {
  const input = {
    authUserId: 'auth-user-id',
    companyName: 'Acme Transport',
    fullName: 'Ada Admin',
    phone: '+13125550100',
  };

  it('creates one tenant and one admin user in one transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-id' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const repository = new AuthRepository('postgresql://unused', {
      connect: jest.fn().mockResolvedValue({ query, release }),
    });

    await expect(repository.createCompanyAccount(input)).resolves.toEqual({
      tenantId: 'tenant-id',
    });
    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO public.app_users'),
      ['auth-user-id', 'tenant-id', 'admin', 'Ada Admin', '+13125550100'],
    );
    expect(query).toHaveBeenNthCalledWith(4, 'COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('rolls back and releases the client when either write fails', async () => {
    const failure = new Error('write failed');
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-id' }] })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const repository = new AuthRepository('postgresql://unused', {
      connect: jest.fn().mockResolvedValue({ query, release }),
    });

    await expect(repository.createCompanyAccount(input)).rejects.toBe(failure);
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(query).not.toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
