import { Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { AuthRole } from "./auth.types";

export interface CreateCompanyAccountInput {
  authUserId: string;
  companyName: string;
  fullName: string;
  phone: string;
}

export interface CreatedCompanyAccount {
  tenantId: string;
}

export interface AppUserProfile {
  id: string;
  tenantId: string;
  role: AuthRole;
  fullName: string;
  phone: string;
}

type DatabasePool = Pick<Pool, "connect" | "query">;

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
      await client.query("BEGIN");
      const tenantResult = await client.query<{ id: string }>(
        "INSERT INTO public.tenants (name) VALUES ($1) RETURNING id",
        [input.companyName],
      );
      const tenantId = tenantResult.rows[0]?.id;

      if (!tenantId) {
        throw new Error("Tenant creation returned no identifier.");
      }

      await client.query(
        `INSERT INTO public.app_users
          (id, tenant_id, role, full_name, phone)
         VALUES ($1, $2, $3, $4, $5)`,
        [input.authUserId, tenantId, "admin", input.fullName, input.phone],
      );
      await client.query("COMMIT");

      return { tenantId };
    } catch (error) {
      await this.rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async findAppUserById(authUserId: string): Promise<AppUserProfile | null> {
    const result = await this.pool.query<{
      id: string;
      tenant_id: string;
      role: AuthRole;
      full_name: string;
      phone: string;
    }>(
      `SELECT id, tenant_id, role, full_name, phone
       FROM public.app_users
       WHERE id = $1`,
      [authUserId],
    );
    const profile = result.rows[0];

    return profile
      ? {
          id: profile.id,
          tenantId: profile.tenant_id,
          role: profile.role,
          fullName: profile.full_name,
          phone: profile.phone,
        }
      : null;
  }

  private async rollback(client: PoolClient): Promise<void> {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original transaction error for orchestration and mapping.
    }
  }
}
