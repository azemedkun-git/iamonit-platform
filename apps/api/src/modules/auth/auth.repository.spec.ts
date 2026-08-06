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
      repository.findApplicationAccess(
        "3d10ad51-1d6c-4dfc-9a12-38337bed3440",
      ),
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
      repository.findApplicationAccess(
        "3d10ad51-1d6c-4dfc-9a12-38337bed3440",
      ),
    ).resolves.toMatchObject({ tenantExists: false, tenantStatus: null });
  });

  it("returns null when authoritative application access has no app user", async () => {
    const repository = new AuthRepository("postgresql://unused", {
      connect: jest.fn(),
      query: jest.fn().mockResolvedValue({ rows: [] }),
    });

    await expect(
      repository.findApplicationAccess(
        "3d10ad51-1d6c-4dfc-9a12-38337bed3440",
      ),
    ).resolves.toBeNull();
  });
});
