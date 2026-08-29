import { UsersRepository } from './users.repository';

describe('UsersRepository', () => {
  const tenantA = '11111111-1111-4111-8111-111111111111';
  const tenantB = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';

  it('uses the tenant-scoped active-membership query and maps rows', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          user_id: userId,
          membership_id: 'membership-b',
          email: 'person@example.com',
          full_name: 'Person Example',
          phone: '+13125550100',
          role: 'dispatcher',
          status: 'active',
        },
      ],
    });
    const repository = new UsersRepository('postgresql://unused', {
      query: query as never,
    });

    await expect(repository.findActiveUsersByTenantId(tenantB)).resolves.toEqual([
      {
        userId,
        membershipId: 'membership-b',
        email: 'person@example.com',
        fullName: 'Person Example',
        phone: '+13125550100',
        role: 'dispatcher',
        status: 'active',
      },
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0] as [string, string[]];
    expect(parameters).toEqual([tenantB]);
    expect(sql).toContain('tenant_memberships.tenant_id = $1');
    expect(sql).not.toContain(tenantB);
    expect(sql).toContain("tenant_memberships.status = 'active'");
    expect(sql).toContain("tenants.status = 'active'");
    expect(sql).toContain('public.tenant_memberships');
    expect(sql).toContain('public.user_profiles');
    expect(sql).toContain('auth.users');
    expect(sql).not.toContain('app_users');
  });

  it('returns an empty list when the database returns no rows', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const repository = new UsersRepository('postgresql://unused', {
      query: query as never,
    });

    await expect(repository.findActiveUsersByTenantId(tenantA)).resolves.toEqual(
      [],
    );
  });

  it('preserves the membership role selected by each tenant-scoped query', async () => {
    const rowsByTenant = {
      [tenantA]: [
        {
          user_id: userId,
          membership_id: 'membership-a',
          email: 'person@example.com',
          full_name: 'Person Example',
          phone: '+13125550100',
          role: 'admin',
          status: 'active',
        },
      ],
      [tenantB]: [
        {
          user_id: userId,
          membership_id: 'membership-b',
          email: 'person@example.com',
          full_name: 'Person Example',
          phone: '+13125550100',
          role: 'dispatcher',
          status: 'active',
        },
      ],
    };
    const query = jest.fn((_sql: string, parameters?: unknown[]) =>
      Promise.resolve({
        rows: rowsByTenant[parameters?.[0] as keyof typeof rowsByTenant] ?? [],
      }),
    );
    const repository = new UsersRepository('postgresql://unused', {
      query: query as never,
    });

    const tenantAUsers = await repository.findActiveUsersByTenantId(tenantA);
    const tenantBUsers = await repository.findActiveUsersByTenantId(tenantB);

    expect(tenantAUsers).toMatchObject([
      { membershipId: 'membership-a', role: 'admin' },
    ]);
    expect(tenantBUsers).toMatchObject([
      { membershipId: 'membership-b', role: 'dispatcher' },
    ]);
    expect(tenantBUsers).not.toContainEqual(
      expect.objectContaining({ membershipId: 'membership-a' }),
    );
    expect(query.mock.calls.map((call) => call[1])).toEqual([
      [tenantA],
      [tenantB],
    ]);
  });

  it('propagates database failures without acquiring a client resource', async () => {
    const failure = new Error('database failure');
    const query = jest.fn().mockRejectedValue(failure);
    const repository = new UsersRepository('postgresql://unused', { query });

    await expect(repository.findActiveUsersByTenantId(tenantA)).rejects.toBe(
      failure,
    );
    expect(query).toHaveBeenCalledTimes(1);
  });
});
