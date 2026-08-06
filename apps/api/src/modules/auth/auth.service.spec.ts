import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseClient } from "@supabase/supabase-js";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";

describe("AuthService", () => {
  const registration = {
    email: "admin@example.com",
    password: "secret-password",
    companyName: "Acme Transport",
    fullName: "Ada Admin",
    phone: "+13125550100",
  };
  const user = { id: "auth-user-id", email: registration.email };
  const session = {
    access_token: "access-secret",
    refresh_token: "refresh-secret",
    expires_in: 3600,
    expires_at: 123456,
    token_type: "bearer",
  };

  function setup(
    signUpResult: object = { data: { user, session }, error: null },
  ) {
    const signUp = jest.fn().mockResolvedValue(signUpResult);
    const signInWithPassword = jest.fn().mockResolvedValue({
      data: { user, session },
      error: null,
    });
    const deleteUser = jest
      .fn()
      .mockResolvedValue({ data: { user: null }, error: null });
    const createCompanyAccount = jest
      .fn()
      .mockResolvedValue({ tenantId: "tenant-id" });
    const findAppUserById = jest.fn().mockResolvedValue({
      id: user.id,
      tenantId: "tenant-id",
      role: "dispatcher",
      fullName: "Dana Dispatcher",
      phone: "+13125550101",
    });
    const publicClient = {
      auth: { signUp, signInWithPassword },
    } as unknown as SupabaseClient;
    const adminClient = {
      auth: { admin: { deleteUser } },
    } as unknown as SupabaseClient;
    const repository = {
      createCompanyAccount,
      findAppUserById,
    } as unknown as AuthRepository;
    const config = { getOrThrow: jest.fn() } as unknown as ConfigService;
    const service = new AuthService(
      publicClient,
      adminClient,
      config,
      repository,
    );

    return {
      service,
      signUp,
      signInWithPassword,
      deleteUser,
      createCompanyAccount,
      findAppUserById,
    };
  }

  it("creates Auth and database records and returns the approved session contract", async () => {
    const { service, signUp, createCompanyAccount } = setup();

    await expect(service.register(registration)).resolves.toEqual({
      session: {
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresIn: 3600,
        expiresAt: 123456,
        tokenType: "bearer",
      },
      requiresEmailConfirmation: false,
      user: {
        id: "auth-user-id",
        email: registration.email,
        tenantId: "tenant-id",
        role: "admin",
        fullName: "Ada Admin",
        phone: "+13125550100",
      },
    });
    expect(signUp).toHaveBeenCalledWith({
      email: registration.email,
      password: registration.password,
    });
    expect(createCompanyAccount).toHaveBeenCalledWith({
      authUserId: "auth-user-id",
      companyName: "Acme Transport",
      fullName: "Ada Admin",
      phone: "+13125550100",
    });
  });

  it("derives admin role and ignores extra client input", async () => {
    const { service, createCompanyAccount } = setup();

    const response = await service.register({
      ...registration,
      role: "dispatcher",
    } as typeof registration);

    expect(response.user.role).toBe("admin");
    expect(createCompanyAccount).toHaveBeenCalledWith(
      expect.not.objectContaining({ role: expect.anything() }),
    );
  });

  it("returns null session when email confirmation is required", async () => {
    const { service } = setup({ data: { user, session: null }, error: null });

    const response = await service.register(registration);

    expect(response.session).toBeNull();
    expect(response.requiresEmailConfirmation).toBe(true);
  });

  it("maps duplicate email and does not write to the database", async () => {
    const { service, createCompanyAccount } = setup({
      data: { user: null, session: null },
      error: { code: "user_already_exists", message: "duplicate" },
    });

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(createCompanyAccount).not.toHaveBeenCalled();
  });

  it("maps Auth provider unavailability to 503", async () => {
    const { service } = setup({
      data: { user: null, session: null },
      error: { status: 503, message: "provider response body" },
    });

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("compensates Auth after a database failure", async () => {
    const { service, createCompanyAccount, deleteUser } = setup();
    createCompanyAccount.mockRejectedValueOnce(new Error("database detail"));

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(deleteUser).toHaveBeenCalledWith("auth-user-id");
  });

  it("maps duplicate company name to 409 after compensation", async () => {
    const { service, createCompanyAccount, deleteUser } = setup();
    createCompanyAccount.mockRejectedValueOnce({
      code: "23505",
      constraint: "tenants_name_key",
    });

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deleteUser).toHaveBeenCalledWith("auth-user-id");
  });

  it("maps database unavailability to 503 after compensation", async () => {
    const { service, createCompanyAccount } = setup();
    createCompanyAccount.mockRejectedValueOnce({ code: "08006" });

    await expect(service.register(registration)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("returns a safe 500 and logs only the orphan id when compensation fails", async () => {
    const { service, createCompanyAccount, deleteUser } = setup();
    createCompanyAccount.mockRejectedValueOnce(new Error("database secret"));
    deleteUser.mockResolvedValueOnce({
      data: null,
      error: {
        message: "provider body with access-secret and secret-password",
      },
    });
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation();

    await expect(service.register(registration)).rejects.toMatchObject({
      response: expect.not.stringContaining("secret"),
    });
    expect(logger).toHaveBeenCalledWith(
      "Auth compensation failed for orphaned user auth-user-id.",
    );
    const logged = JSON.stringify(logger.mock.calls);
    expect(logged).not.toContain("access-secret");
    expect(logged).not.toContain("secret-password");
    expect(logged).not.toContain("provider body");
    expect(logged).not.toContain("database secret");
  });

  it("logs in with the public client and returns the linked user context", async () => {
    const { service, signInWithPassword, findAppUserById, deleteUser } =
      setup();

    await expect(
      service.login({
        email: registration.email,
        password: registration.password,
      }),
    ).resolves.toEqual({
      session: {
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresIn: 3600,
        expiresAt: 123456,
        tokenType: "bearer",
      },
      requiresEmailConfirmation: false,
      user: {
        id: "auth-user-id",
        email: registration.email,
        tenantId: "tenant-id",
        role: "dispatcher",
        fullName: "Dana Dispatcher",
        phone: "+13125550101",
      },
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: registration.email,
      password: registration.password,
    });
    expect(findAppUserById).toHaveBeenCalledWith("auth-user-id");
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("maps invalid credentials to a generic 401 without loading a profile", async () => {
    const { service, signInWithPassword, findAppUserById } = setup();
    signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: {
        status: 400,
        code: "invalid_credentials",
        message: "Invalid login credentials",
      },
    });

    await expect(service.login(registration)).rejects.toMatchObject({
      constructor: UnauthorizedException,
      response: {
        statusCode: 401,
        message: "Invalid email or password.",
      },
    });
    expect(findAppUserById).not.toHaveBeenCalled();
  });

  it("maps a valid Auth identity without an app-user profile to 403", async () => {
    const { service, findAppUserById } = setup();
    findAppUserById.mockResolvedValueOnce(null);

    await expect(service.login(registration)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("maps Auth provider unavailability during login to 503", async () => {
    const { service, signInWithPassword } = setup();
    signInWithPassword.mockRejectedValueOnce({
      status: 503,
      message: "provider response with secret-password",
    });

    await expect(service.login(registration)).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      response: expect.not.stringContaining("secret-password"),
    });
  });

  it("maps database unavailability during login to 503", async () => {
    const { service, findAppUserById } = setup();
    findAppUserById.mockRejectedValueOnce({ code: "08006" });

    await expect(service.login(registration)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it("returns a safe 500 for an incomplete session or inconsistent profile", async () => {
    const { service, signInWithPassword, findAppUserById } = setup();
    signInWithPassword.mockResolvedValueOnce({
      data: { user, session: null },
      error: null,
    });

    await expect(service.login(registration)).rejects.toMatchObject({
      constructor: InternalServerErrorException,
      response: expect.not.stringContaining("access-secret"),
    });

    findAppUserById.mockResolvedValueOnce({
      id: "different-user-id",
      tenantId: "tenant-id",
      role: "admin",
      fullName: "Ada Admin",
      phone: "+13125550100",
    });

    await expect(service.login(registration)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it("does not expose credentials or service-role material in login errors or logs", async () => {
    const { service, findAppUserById } = setup();
    findAppUserById.mockRejectedValueOnce(
      new Error("database detail with service-role-key and access-secret"),
    );
    const logger = jest.spyOn(Logger.prototype, "error").mockImplementation();

    let response: unknown;
    try {
      await service.login(registration);
    } catch (error) {
      response = error;
    }

    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain(registration.password);
    expect(serialized).not.toContain("service-role-key");
    expect(serialized).not.toContain("access-secret");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("secret");
  });
});
