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
    const createTransporterAccount = jest.fn().mockResolvedValue({
      profile: {
        userId: user.id,
        fullName: registration.fullName,
        phone: registration.phone,
      },
      membership: {
        membershipId: "membership-id",
        tenantId: "tenant-id",
        tenantName: registration.companyName,
        role: "admin",
        status: "active",
      },
    });
    const createUserProfile = jest.fn().mockResolvedValue({
      userId: user.id,
      fullName: "Casey Puller",
      phone: "+13125550102",
    });
    const findAppUserById = jest.fn().mockResolvedValue({
      id: user.id,
      tenantId: "tenant-id",
      role: "dispatcher",
      fullName: "Dana Dispatcher",
      phone: "+13125550101",
    });
    const findUserProfileById = jest.fn().mockResolvedValue({
      userId: user.id,
      fullName: "Dana Dispatcher",
      phone: "+13125550101",
    });
    const findBootstrapProfileByUserId = jest.fn().mockResolvedValue({
      userId: user.id,
      email: registration.email,
      fullName: "Dana Dispatcher",
      phone: "+13125550101",
    });
    const findActiveMembershipsByUserId = jest.fn().mockResolvedValue([]);
    const publicClient = {
      auth: { signUp, signInWithPassword },
    } as unknown as SupabaseClient;
    const adminClient = {
      auth: { admin: { deleteUser } },
    } as unknown as SupabaseClient;
    const repository = {
      createCompanyAccount,
      createTransporterAccount,
      createUserProfile,
      findAppUserById,
      findUserProfileById,
      findBootstrapProfileByUserId,
      findActiveMembershipsByUserId,
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
      createTransporterAccount,
      createUserProfile,
      findAppUserById,
      findUserProfileById,
      findBootstrapProfileByUserId,
      findActiveMembershipsByUserId,
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

  it("registers a transporter with one selected active admin membership", async () => {
    const { service, signUp, createTransporterAccount } = setup();

    await expect(service.registerTransporter(registration)).resolves.toEqual({
      session: {
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresIn: 3600,
        expiresAt: 123456,
        tokenType: "bearer",
      },
      requiresEmailConfirmation: false,
      profile: {
        userId: user.id,
        email: registration.email,
        fullName: registration.fullName,
        phone: registration.phone,
      },
      memberships: [
        {
          membershipId: "membership-id",
          tenantId: "tenant-id",
          tenantName: registration.companyName,
          role: "admin",
          status: "active",
        },
      ],
      selectedMembership: {
        membershipId: "membership-id",
        tenantId: "tenant-id",
        tenantName: registration.companyName,
        role: "admin",
        status: "active",
      },
    });
    expect(signUp).toHaveBeenCalledWith({
      email: registration.email,
      password: registration.password,
    });
    expect(createTransporterAccount).toHaveBeenCalledWith({
      authUserId: user.id,
      companyName: registration.companyName,
      fullName: registration.fullName,
      phone: registration.phone,
    });
  });

  it("supports transporter email confirmation without a session", async () => {
    const { service } = setup({
      data: { user, session: null },
      error: null,
    });

    await expect(
      service.registerTransporter(registration),
    ).resolves.toMatchObject({
      session: null,
      requiresEmailConfirmation: true,
    });
  });

  it("compensates a new transporter Auth identity after persistence failure", async () => {
    const { service, createTransporterAccount, deleteUser } = setup();
    createTransporterAccount.mockRejectedValueOnce(
      new Error("postgres connection detail"),
    );

    await expect(
      service.registerTransporter(registration),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(deleteUser).toHaveBeenCalledWith(user.id);
  });

  it("allows duplicate company display names and maps only database uniqueness safely", async () => {
    const { service, createTransporterAccount } = setup();

    await expect(
      service.registerTransporter(registration),
    ).resolves.toBeDefined();
    createTransporterAccount.mockRejectedValueOnce({
      code: "23505",
      constraint: "user_profiles_pkey",
      detail: "raw postgres detail",
    });
    await expect(
      service.registerTransporter(registration),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: expect.not.stringContaining("postgres"),
    });
  });

  it("does not persist or compensate when Supabase reports an existing identity", async () => {
    const existingUser = { ...user, identities: [] };
    const { service, createTransporterAccount, deleteUser } = setup({
      data: { user: existingUser, session: null },
      error: null,
    });

    await expect(
      service.registerTransporter(registration),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(createTransporterAccount).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("registers a car puller as a profile without tenant access", async () => {
    const { service, createUserProfile, createTransporterAccount } = setup();
    const input = {
      email: "puller@example.com",
      password: "secret-password",
      fullName: "Casey Puller",
      phone: "+13125550102",
    };

    await expect(service.registerCarPuller(input)).resolves.toEqual({
      session: {
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresIn: 3600,
        expiresAt: 123456,
        tokenType: "bearer",
      },
      requiresEmailConfirmation: false,
      profile: {
        userId: user.id,
        email: registration.email,
        fullName: input.fullName,
        phone: input.phone,
      },
      memberships: [],
      selectedMembership: null,
    });
    expect(createUserProfile).toHaveBeenCalledWith({
      authUserId: user.id,
      fullName: input.fullName,
      phone: input.phone,
    });
    expect(createTransporterAccount).not.toHaveBeenCalled();
  });

  it("supports car-puller confirmation and compensates persistence failure", async () => {
    const input = {
      email: "puller@example.com",
      password: "secret-password",
      fullName: "Casey Puller",
      phone: "+13125550102",
    };
    const confirmation = setup({
      data: { user, session: null },
      error: null,
    });
    await expect(
      confirmation.service.registerCarPuller(input),
    ).resolves.toMatchObject({
      session: null,
      requiresEmailConfirmation: true,
      memberships: [],
      selectedMembership: null,
    });

    const failure = setup();
    failure.createUserProfile.mockRejectedValueOnce(new Error("database raw"));
    await expect(
      failure.service.registerCarPuller(input),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(failure.deleteUser).toHaveBeenCalledWith(user.id);
  });

  it("logs in multi-tenant users with zero active memberships", async () => {
    const {
      service,
      findUserProfileById,
      findActiveMembershipsByUserId,
      findAppUserById,
    } = setup();

    await expect(service.loginMultiTenant(registration)).resolves.toEqual({
      session: {
        accessToken: "access-secret",
        refreshToken: "refresh-secret",
        expiresIn: 3600,
        expiresAt: 123456,
        tokenType: "bearer",
      },
      requiresEmailConfirmation: false,
      profile: {
        userId: user.id,
        email: registration.email,
        fullName: "Dana Dispatcher",
        phone: "+13125550101",
      },
      memberships: [],
      selectedMembership: null,
    });
    expect(findUserProfileById).toHaveBeenCalledWith(user.id);
    expect(findActiveMembershipsByUserId).toHaveBeenCalledWith(user.id);
    expect(findAppUserById).not.toHaveBeenCalled();
  });

  it("selects exactly one active membership automatically", async () => {
    const { service, findActiveMembershipsByUserId } = setup();
    const membership = {
      membershipId: "membership-id",
      tenantId: "tenant-id",
      tenantName: "Acme Transport",
      role: "dispatcher",
      status: "active",
    };
    findActiveMembershipsByUserId.mockResolvedValueOnce([membership]);

    await expect(service.loginMultiTenant(registration)).resolves.toMatchObject(
      {
        memberships: [membership],
        selectedMembership: membership,
      },
    );
  });

  it("returns all tenant-specific roles but selects none when several are active", async () => {
    const { service, findActiveMembershipsByUserId } = setup();
    const memberships = [
      {
        membershipId: "membership-a",
        tenantId: "tenant-a",
        tenantName: "Alpha Towing",
        role: "admin",
        status: "active",
      },
      {
        membershipId: "membership-b",
        tenantId: "tenant-b",
        tenantName: "Bravo Recovery",
        role: "car_puller",
        status: "active",
      },
    ];
    findActiveMembershipsByUserId.mockResolvedValueOnce(memberships);

    await expect(service.loginMultiTenant(registration)).resolves.toMatchObject(
      {
        memberships,
        selectedMembership: null,
      },
    );
  });

  it("safely rejects invalid credentials and a missing multi-tenant profile", async () => {
    const invalid = setup();
    invalid.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", status: 400 },
    });
    await expect(
      invalid.service.loginMultiTenant(registration),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(invalid.findUserProfileById).not.toHaveBeenCalled();

    const missing = setup();
    missing.findUserProfileById.mockResolvedValueOnce(null);
    await expect(
      missing.service.loginMultiTenant(registration),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(missing.findAppUserById).not.toHaveBeenCalled();
  });

  it("bootstraps profile and zero memberships from verified identity.userId", async () => {
    const {
      service,
      findBootstrapProfileByUserId,
      findActiveMembershipsByUserId,
      findAppUserById,
    } = setup();
    const identity = { userId: "auth-user-id" };

    await expect(service.getCurrentUser(identity)).resolves.toEqual({
      profile: {
        userId: user.id,
        email: registration.email,
        fullName: "Dana Dispatcher",
        phone: "+13125550101",
      },
      memberships: [],
      selectedMembership: null,
    });
    expect(findBootstrapProfileByUserId).toHaveBeenCalledWith(identity.userId);
    expect(findActiveMembershipsByUserId).toHaveBeenCalledWith(identity.userId);
    expect(findAppUserById).not.toHaveBeenCalled();
  });

  it("selects the exact sole active membership and preserves its tenant role", async () => {
    const { service, findActiveMembershipsByUserId } = setup();
    const membership = {
      membershipId: "membership-id",
      tenantId: "tenant-id",
      tenantName: "Acme Transport",
      role: "dispatcher",
      status: "active",
    };
    findActiveMembershipsByUserId.mockResolvedValueOnce([membership]);

    await expect(
      service.getCurrentUser({ userId: user.id }),
    ).resolves.toMatchObject({
      memberships: [membership],
      selectedMembership: membership,
    });
  });

  it("preserves multiple active memberships without selecting the first", async () => {
    const { service, findActiveMembershipsByUserId } = setup();
    const memberships = [
      {
        membershipId: "membership-a",
        tenantId: "tenant-a",
        tenantName: "Alpha Towing",
        role: "admin",
        status: "active",
      },
      {
        membershipId: "membership-b",
        tenantId: "tenant-b",
        tenantName: "Bravo Recovery",
        role: "car_puller",
        status: "active",
      },
    ];
    findActiveMembershipsByUserId.mockResolvedValueOnce(memberships);

    await expect(
      service.getCurrentUser({ userId: user.id }),
    ).resolves.toMatchObject({ memberships, selectedMembership: null });
  });

  it("safely forbids bootstrap when no application profile exists", async () => {
    const { service, findBootstrapProfileByUserId } = setup();
    findBootstrapProfileByUserId.mockResolvedValueOnce(null);

    await expect(
      service.getCurrentUser({ userId: user.id }),
    ).rejects.toMatchObject({
      status: 403,
      message: "Account access is not configured.",
    });
  });

  it.each([
    [{ code: "08006", message: "database URL" }, 503, "Database is unavailable."],
    [new Error("SQL text and credentials"), 500, "Account bootstrap could not be completed."],
  ])("maps bootstrap database failures safely", async (failure, status, message) => {
    const { service, findBootstrapProfileByUserId } = setup();
    findBootstrapProfileByUserId.mockRejectedValueOnce(failure);

    await expect(
      service.getCurrentUser({ userId: user.id }),
    ).rejects.toMatchObject({ status, message });
  });
});
