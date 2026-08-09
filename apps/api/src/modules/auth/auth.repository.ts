import { Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import {
  AuthRole,
  MembershipStatus,
  MembershipSummary,
  UserProfileRecord,
} from "./auth.types";

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

export interface ApplicationAccess {
  userId: string;
  tenantId: string;
  role: string;
  tenantExists: boolean;
  tenantStatus: string | null;
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

  async findUserProfileById(userId: string): Promise<UserProfileRecord | null> {
    const result = await this.pool.query<{
      user_id: string;
      full_name: string;
      phone: string;
    }>(
      `SELECT user_id, full_name, phone
       FROM public.user_profiles
       WHERE user_id = $1`,
      [userId],
    );
    const profile = result.rows[0];

    return profile
      ? {
          userId: profile.user_id,
          fullName: profile.full_name,
          phone: profile.phone,
        }
      : null;
  }

  async findMembershipsByUserId(
    userId: string,
  ): Promise<MembershipSummary[]> {
    const result = await this.pool.query<{
      membership_id: string;
      tenant_id: string;
      tenant_name: string;
      role: AuthRole;
      status: MembershipStatus;
    }>(
      `SELECT tenant_memberships.id AS membership_id,
              tenant_memberships.tenant_id,
              tenants.name AS tenant_name,
              tenant_memberships.role,
              tenant_memberships.status
       FROM public.tenant_memberships AS tenant_memberships
       INNER JOIN public.tenants AS tenants
         ON tenants.id = tenant_memberships.tenant_id
       WHERE tenant_memberships.user_id = $1
       ORDER BY tenants.name, tenant_memberships.tenant_id,
                tenant_memberships.id`,
      [userId],
    );

    return result.rows.map((membership) => this.mapMembership(membership));
  }

  async findActiveMembership(
    userId: string,
    tenantId: string,
  ): Promise<MembershipSummary | null> {
    const result = await this.pool.query<{
      membership_id: string;
      tenant_id: string;
      tenant_name: string;
      role: AuthRole;
      status: MembershipStatus;
    }>(
      `SELECT tenant_memberships.id AS membership_id,
              tenant_memberships.tenant_id,
              tenants.name AS tenant_name,
              tenant_memberships.role,
              tenant_memberships.status
       FROM public.tenant_memberships AS tenant_memberships
       INNER JOIN public.tenants AS tenants
         ON tenants.id = tenant_memberships.tenant_id
       WHERE tenant_memberships.user_id = $1
         AND tenant_memberships.tenant_id = $2
         AND tenant_memberships.status = 'active'
         AND tenants.status = 'active'`,
      [userId, tenantId],
    );
    const membership = result.rows[0];

    return membership ? this.mapMembership(membership) : null;
  }

  async findApplicationAccess(
    authUserId: string,
  ): Promise<ApplicationAccess | null> {
    const result = await this.pool.query<{
      user_id: string;
      tenant_id: string;
      role: string;
      tenant_exists: boolean;
      tenant_status: string | null;
    }>(
      `SELECT app_users.id AS user_id,
              app_users.tenant_id,
              app_users.role,
              (tenants.id IS NOT NULL) AS tenant_exists,
              tenants.status AS tenant_status
       FROM public.app_users AS app_users
       LEFT JOIN public.tenants AS tenants ON tenants.id = app_users.tenant_id
       WHERE app_users.id = $1`,
      [authUserId],
    );
    const access = result.rows[0];

    return access
      ? {
          userId: access.user_id,
          tenantId: access.tenant_id,
          role: access.role,
          tenantExists: access.tenant_exists,
          tenantStatus: access.tenant_status,
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

  private mapMembership(membership: {
    membership_id: string;
    tenant_id: string;
    tenant_name: string;
    role: AuthRole;
    status: MembershipStatus;
  }): MembershipSummary {
    return {
      membershipId: membership.membership_id,
      tenantId: membership.tenant_id,
      tenantName: membership.tenant_name,
      role: membership.role,
      status: membership.status,
    };
  }
}
