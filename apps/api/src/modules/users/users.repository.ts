import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { AuthRole, MembershipStatus } from '../auth/auth.types';
import { TenantUser } from './users.types';

type DatabasePool = Pick<Pool, 'query'>;

interface TenantUserRow {
  user_id: string;
  membership_id: string;
  email: string;
  full_name: string;
  phone: string;
  role: AuthRole;
  status: MembershipStatus;
}

@Injectable()
export class UsersRepository {
  private readonly pool: DatabasePool;

  constructor(databaseUrl: string, pool?: DatabasePool) {
    this.pool = pool ?? new Pool({ connectionString: databaseUrl });
  }

  async findActiveUsersByTenantId(tenantId: string): Promise<TenantUser[]> {
    const result = await this.pool.query<TenantUserRow>(
      `SELECT tenant_memberships.user_id,
              tenant_memberships.id AS membership_id,
              auth_users.email,
              user_profiles.full_name,
              user_profiles.phone,
              tenant_memberships.role,
              tenant_memberships.status
       FROM public.tenant_memberships AS tenant_memberships
       INNER JOIN public.user_profiles AS user_profiles
         ON user_profiles.user_id = tenant_memberships.user_id
       INNER JOIN auth.users AS auth_users
         ON auth_users.id = tenant_memberships.user_id
       INNER JOIN public.tenants AS tenants
         ON tenants.id = tenant_memberships.tenant_id
       WHERE tenant_memberships.tenant_id = $1
         AND tenant_memberships.status = 'active'
         AND tenants.status = 'active'
       ORDER BY user_profiles.full_name, tenant_memberships.user_id,
                tenant_memberships.id`,
      [tenantId],
    );

    return result.rows.map((user) => ({
      userId: user.user_id,
      membershipId: user.membership_id,
      email: user.email,
      fullName: user.full_name,
      phone: user.phone,
      role: user.role,
      status: user.status,
    }));
  }
}
