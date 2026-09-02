import { AuthRepository } from "./auth.repository";

describe("AuthRepository", () => {
  const input = {
    authUserId: "auth-user-id",
    companyName: "Acme Transport",
    fullName: "Ada Admin",
    phone: "+13125550100",
  };

  it("creates one tenant and one admin user in one transaction", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "tenant-id" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn().mockResolvedValue({ query, release }),
      query: jest.fn(),
    });

    await expect(repository.createCompanyAccount(input)).resolves.toEqual({
      tenantId: "tenant-id",
    });
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("INSERT INTO public.app_users"),
      ["auth-user-id", "tenant-id", "admin", "Ada Admin", "+13125550100"],
    );
    expect(query).toHaveBeenNthCalledWith(4, "COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back and releases the client when either write fails", async () => {
    const failure = new Error("write failed");
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: "tenant-id" }] })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn().mockResolvedValue({ query, release }),
      query: jest.fn(),
    });

    await expect(repository.createCompanyAccount(input)).rejects.toBe(failure);
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("creates a profile, duplicate-name tenant, and active admin membership atomically", async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "auth-user-id",
            full_name: "Ada Admin",
            phone: "+13125550100",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "tenant-id", name: "Acme Transport" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            membership_id: "membership-id",
            tenant_id: "tenant-id",
            tenant_name: "Acme Transport",
            role: "admin",
            status: "active",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn().mockResolvedValue({ query, release }),
      query: jest.fn(),
    });

    await expect(repository.createTransporterAccount(input)).resolves.toEqual({
      profile: {
        userId: "auth-user-id",
        fullName: "Ada Admin",
        phone: "+13125550100",
      },
      membership: {
        membershipId: "membership-id",
        tenantId: "tenant-id",
        tenantName: "Acme Transport",
        role: "admin",
        status: "active",
      },
    });
    expect(query).toHaveBeenNthCalledWith(1, "BEGIN");
    expect(query.mock.calls[1][0]).toContain(
      "INSERT INTO public.user_profiles",
    );
    expect(query.mock.calls[2][0]).toContain("INSERT INTO public.tenants");
    expect(query.mock.calls[2][0]).not.toMatch(/conflict|name_key/i);
    expect(query.mock.calls[3][0]).toContain(
      "INSERT INTO public.tenant_memberships",
    );
    expect(query.mock.calls[3][0]).toContain("'admin', 'active'");
    expect(query).toHaveBeenNthCalledWith(5, "COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("rolls back all transporter writes when membership creation fails", async () => {
    const failure = new Error("membership write failed");
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            user_id: "auth-user-id",
            full_name: "Ada Admin",
            phone: "+13125550100",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "tenant-id", name: "Acme Transport" }],
      })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ rows: [] });
    const release = jest.fn();
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn().mockResolvedValue({ query, release }),
      query: jest.fn(),
    });

    await expect(repository.createTransporterAccount(input)).rejects.toBe(
      failure,
    );
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("creates only a user profile for an individual car puller", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          user_id: "auth-user-id",
          full_name: "Casey Puller",
          phone: "+13125550102",
        },
      ],
    });
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query,
    });

    await expect(
      repository.createUserProfile({
        authUserId: "auth-user-id",
        fullName: "Casey Puller",
        phone: "+13125550102",
      }),
    ).resolves.toEqual({
      userId: "auth-user-id",
      fullName: "Casey Puller",
      phone: "+13125550102",
    });
    expect(query.mock.calls[0][0]).toContain("public.user_profiles");
    expect(query.mock.calls[0][0]).not.toMatch(/tenants|memberships|app_users/);
  });

  it("loads and maps an app-user profile by Auth user id", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          id: "auth-user-id",
          tenant_id: "tenant-id",
          role: "car_puller",
          full_name: "Casey Puller",
          phone: "+13125550102",
        },
      ],
    });
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query,
    });

    await expect(repository.findAppUserById("auth-user-id")).resolves.toEqual({
      id: "auth-user-id",
      tenantId: "tenant-id",
      role: "car_puller",
      fullName: "Casey Puller",
      phone: "+13125550102",
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM public.app_users"),
      ["auth-user-id"],
    );
  });

  it("returns null when no linked app-user profile exists", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(
      repository.findAppUserById("missing-user-id"),
    ).resolves.toBeNull();
  });

  it("loads a person profile from user_profiles", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          user_id: "auth-user-id",
          full_name: "Ada Admin",
          phone: "+13125550100",
        },
      ],
    });
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query,
    });

    await expect(
      repository.findUserProfileById("auth-user-id"),
    ).resolves.toEqual({
      userId: "auth-user-id",
      fullName: "Ada Admin",
      phone: "+13125550100",
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("FROM public.user_profiles"),
      ["auth-user-id"],
    );
    expect(query.mock.calls[0][0]).not.toContain("public.app_users");
  });

  it("returns null when no person profile exists", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(
      repository.findUserProfileById("missing-user-id"),
    ).resolves.toBeNull();
  });

  it("loads exact bootstrap identity fields from user_profiles and auth.users", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          user_id: "auth-user-id",
          email: "ada@example.com",
          full_name: "Ada Admin",
          phone: "+13125550100",
          raw_user_meta_data: { ignored: true },
        },
      ],
    });
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query,
    });

    await expect(
      repository.findBootstrapProfileByUserId("auth-user-id"),
    ).resolves.toEqual({
      userId: "auth-user-id",
      email: "ada@example.com",
      fullName: "Ada Admin",
      phone: "+13125550100",
    });
    const [sql, parameters] = query.mock.calls[0];
    expect(sql).toContain("FROM public.user_profiles AS user_profiles");
    expect(sql).toContain("INNER JOIN auth.users AS auth_users");
    expect(sql).toContain("WHERE user_profiles.user_id = $1");
    expect(sql).not.toContain("app_users");
    expect(parameters).toEqual(["auth-user-id"]);
  });

  it("returns null when the bootstrap profile is missing", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(
      repository.findBootstrapProfileByUserId("missing-user-id"),
    ).resolves.toBeNull();
  });

  it("propagates bootstrap profile query failures for safe service mapping", async () => {
    const failure = new Error("database internals");
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockRejectedValue(failure),
    });

    await expect(
      repository.findBootstrapProfileByUserId("auth-user-id"),
    ).rejects.toBe(failure);
  });

  it("returns an empty list when the user has no memberships", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(
      repository.findMembershipsByUserId("auth-user-id"),
    ).resolves.toEqual([]);
  });

  it("maps one membership and its tenant name", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          membership_id: "membership-id",
          tenant_id: "tenant-id",
          tenant_name: "Acme Transport",
          role: "admin",
          status: "active",
        },
      ],
    });
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query,
    });

    await expect(
      repository.findMembershipsByUserId("auth-user-id"),
    ).resolves.toEqual([
      {
        membershipId: "membership-id",
        tenantId: "tenant-id",
        tenantName: "Acme Transport",
        role: "admin",
        status: "active",
      },
    ]);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("FROM public.tenant_memberships");
    expect(sql).toContain("INNER JOIN public.tenants");
    expect(sql).toContain("ORDER BY");
    expect(sql).not.toContain("public.app_users");
  });

  it("preserves multiple memberships and tenant-specific roles", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            membership_id: "membership-a",
            tenant_id: "tenant-a",
            tenant_name: "Alpha Towing",
            role: "dispatcher",
            status: "active",
          },
          {
            membership_id: "membership-b",
            tenant_id: "tenant-b",
            tenant_name: "Bravo Recovery",
            role: "car_puller",
            status: "suspended",
          },
        ],
      }),
    });

    await expect(
      repository.findMembershipsByUserId("auth-user-id"),
    ).resolves.toEqual([
      {
        membershipId: "membership-a",
        tenantId: "tenant-a",
        tenantName: "Alpha Towing",
        role: "dispatcher",
        status: "active",
      },
      {
        membershipId: "membership-b",
        tenantId: "tenant-b",
        tenantName: "Bravo Recovery",
        role: "car_puller",
        status: "suspended",
      },
    ]);
  });

  it("loads an active membership only when both membership and tenant are active", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          membership_id: "membership-id",
          tenant_id: "tenant-id",
          tenant_name: "Acme Transport",
          role: "dispatcher",
          status: "active",
        },
      ],
    });
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query,
    });

    await expect(
      repository.findActiveMembership("auth-user-id", "tenant-id"),
    ).resolves.toEqual({
      membershipId: "membership-id",
      tenantId: "tenant-id",
      tenantName: "Acme Transport",
      role: "dispatcher",
      status: "active",
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /tenant_memberships\.user_id = \$1[\s\S]*tenant_memberships\.tenant_id = \$2[\s\S]*tenant_memberships\.status = 'active'[\s\S]*tenants\.status = 'active'/,
      ),
      ["auth-user-id", "tenant-id"],
    );
  });

  it("returns all active memberships in active tenants deterministically", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          membership_id: "membership-a",
          tenant_id: "tenant-a",
          tenant_name: "Alpha Towing",
          role: "dispatcher",
          status: "active",
        },
        {
          membership_id: "membership-b",
          tenant_id: "tenant-b",
          tenant_name: "Bravo Recovery",
          role: "car_puller",
          status: "active",
        },
      ],
    });
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query,
    });

    await expect(
      repository.findActiveMembershipsByUserId("auth-user-id"),
    ).resolves.toHaveLength(2);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /tenant_memberships\.status = 'active'[\s\S]*tenants\.status = 'active'[\s\S]*ORDER BY/,
      ),
      ["auth-user-id"],
    );
  });

  it("allows zero active memberships", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(
      repository.findActiveMembershipsByUserId("auth-user-id"),
    ).resolves.toEqual([]);
  });

  it.each([
    "a suspended membership",
    "a removed membership",
    "a suspended tenant",
    "an archived tenant",
    "a membership belonging to another tenant",
  ])("rejects %s", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(
      repository.findActiveMembership("auth-user-id", "requested-tenant-id"),
    ).resolves.toBeNull();
  });

  it("loads authoritative application access with tenant state", async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          user_id: "3d10ad51-1d6c-4dfc-9a12-38337bed3440",
          tenant_id: "1aa6f7f9-e3ec-4b32-93ab-5baac785c05f",
          role: "dispatcher",
          tenant_exists: true,
          tenant_status: "active",
        },
      ],
    });
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query,
    });

    await expect(
      repository.findApplicationAccess("3d10ad51-1d6c-4dfc-9a12-38337bed3440"),
    ).resolves.toEqual({
      userId: "3d10ad51-1d6c-4dfc-9a12-38337bed3440",
      tenantId: "1aa6f7f9-e3ec-4b32-93ab-5baac785c05f",
      role: "dispatcher",
      tenantExists: true,
      tenantStatus: "active",
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("LEFT JOIN public.tenants"),
      ["3d10ad51-1d6c-4dfc-9a12-38337bed3440"],
    );
  });

  it("preserves a missing tenant in the authoritative access result", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({
        rows: [
          {
            user_id: "3d10ad51-1d6c-4dfc-9a12-38337bed3440",
            tenant_id: "1aa6f7f9-e3ec-4b32-93ab-5baac785c05f",
            role: "admin",
            tenant_exists: false,
            tenant_status: null,
          },
        ],
      }),
    });

    await expect(
      repository.findApplicationAccess("3d10ad51-1d6c-4dfc-9a12-38337bed3440"),
    ).resolves.toMatchObject({ tenantExists: false, tenantStatus: null });
  });

  it("returns null when authoritative application access has no app user", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(
      repository.findApplicationAccess("3d10ad51-1d6c-4dfc-9a12-38337bed3440"),
    ).resolves.toBeNull();
  });
});
