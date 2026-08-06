import { Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

export interface CreateCompanyAccountInput {
  authUserId: string;
  companyName: string;
  fullName: string;
  phone: string;
}

export interface CreatedCompanyAccount {
  tenantId: string;
}

type DatabasePool = Pick<Pool, 'connect'>;

@Injectable()
export class AuthRepository {
  private readonly pool: DatabasePool;

  constructor(databaseUrl: string, pool?: DatabasePool) {
    this.pool = pool ?? new Pool({ connectionString: databaseUrl });
  }

  async createCompanyAccount(
    input: CreateCompanyAccountInput,
  ): Promise<CreatedCompanyAccount> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const tenantResult = await client.query<{ id: string }>(
        'INSERT INTO public.tenants (name) VALUES ($1) RETURNING id',
        [input.companyName],
      );
      const tenantId = tenantResult.rows[0]?.id;

      if (!tenantId) {
        throw new Error('Tenant creation returned no identifier.');
      }

      await client.query(
        `INSERT INTO public.app_users
          (id, tenant_id, role, full_name, phone)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.authUserId, tenantId, 'admin', input.fullName, input.phone],
      );
      await client.query('COMMIT');

      return { tenantId };
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original transaction error for orchestration and mapping.
    }
  }
}
