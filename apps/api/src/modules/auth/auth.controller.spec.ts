import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  HTTP_CODE_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthResponse, MultiTenantAuthResponse } from "./auth.types";
import { LoginDto } from "./dto/login.dto";
import { RegisterCarPullerDto } from "./dto/register-car-puller.dto";
import { RegisterTransporterDto } from "./dto/register-transporter.dto";
import { RegisterDto } from "./dto/register.dto";

describe("AuthController", () => {
  const response: AuthResponse = {
    session: {
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      expiresAt: 123456,
      tokenType: "bearer",
    },
    requiresEmailConfirmation: false,
    user: {
      id: "user-id",
      email: "admin@example.com",
      tenantId: "tenant-id",
      role: "admin",
      fullName: "Ada Admin",
      phone: "+13125550100",
    },
  };

  const multiTenantResponse: MultiTenantAuthResponse = {
    session: response.session,
    requiresEmailConfirmation: false,
    profile: {
      userId: "user-id",
      email: "user@example.com",
      fullName: "Casey Carrier",
      phone: "+13125550101",
    },
    memberships: [
      {
        membershipId: "membership-id",
        tenantId: "tenant-id",
        tenantName: "Acme Transport",
        role: "admin",
        status: "active",
      },
    ],
    selectedMembership: null,
  };

  let controller: AuthController;
  let register: jest.MockedFunction<AuthService["register"]>;
  let registerTransporter: jest.MockedFunction<
    AuthService["registerTransporter"]
  >;
  let registerCarPuller: jest.MockedFunction<
    AuthService["registerCarPuller"]
  >;
  let login: jest.MockedFunction<AuthService["login"]>;
  let loginMultiTenant: jest.MockedFunction<AuthService["loginMultiTenant"]>;

  beforeEach(() => {
    register = jest.fn();
    registerTransporter = jest.fn();
    registerCarPuller = jest.fn();
    login = jest.fn();
    loginMultiTenant = jest.fn();
    controller = new AuthController({
      register,
      registerTransporter,
      registerCarPuller,
      login,
      loginMultiTenant,
    } as unknown as AuthService);
  });

  it("delegates registration DTOs and forwards the service response", async () => {
    const input: RegisterDto = {
      email: "admin@example.com",
      password: "secret-password",
      companyName: "Acme Transport",
      fullName: "Ada Admin",
      phone: "+13125550100",
    };
    register.mockResolvedValue(response);

    await expect(controller.register(input)).resolves.toBe(response);
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith(input);
  });

  it("declares HTTP 201 for registration", () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.register)).toBe(
      HttpStatus.CREATED,
    );
  });

  it("delegates transporter registration without introducing a client role", async () => {
    const input: RegisterTransporterDto = {
      email: "transporter@example.com",
      password: "secret-password",
      companyName: "Acme Transport",
      fullName: "Casey Carrier",
      phone: "+13125550101",
    };
    registerTransporter.mockResolvedValue(multiTenantResponse);

    await expect(controller.registerTransporter(input)).resolves.toBe(
      multiTenantResponse,
    );
    expect(registerTransporter).toHaveBeenCalledTimes(1);
    expect(registerTransporter).toHaveBeenCalledWith(input);
    expect(input).not.toHaveProperty("role");
  });

  it("delegates car-puller registration without requiring a company name", async () => {
    const input: RegisterCarPullerDto = {
      email: "puller@example.com",
      password: "secret-password",
      fullName: "Pat Puller",
      phone: "+13125550102",
    };
    registerCarPuller.mockResolvedValue(multiTenantResponse);

    await expect(controller.registerCarPuller(input)).resolves.toBe(
      multiTenantResponse,
    );
    expect(registerCarPuller).toHaveBeenCalledTimes(1);
    expect(registerCarPuller).toHaveBeenCalledWith(input);
    expect(input).not.toHaveProperty("companyName");
  });

  it("delegates login DTOs and forwards the service response", async () => {
    const input: LoginDto = {
      email: "admin@example.com",
      password: "secret-password",
    };
    login.mockResolvedValue(response);

    await expect(controller.login(input)).resolves.toBe(response);
    expect(login).toHaveBeenCalledTimes(1);
    expect(login).toHaveBeenCalledWith(input);
  });

  it("declares HTTP 200 for login", () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.login)).toBe(
      HttpStatus.OK,
    );
  });

  it("delegates multi-tenant login DTOs and forwards the service response", async () => {
    const input: LoginDto = {
      email: "user@example.com",
      password: "secret-password",
    };
    loginMultiTenant.mockResolvedValue(multiTenantResponse);

    await expect(controller.loginMultiTenant(input)).resolves.toBe(
      multiTenantResponse,
    );
    expect(loginMultiTenant).toHaveBeenCalledTimes(1);
    expect(loginMultiTenant).toHaveBeenCalledWith(input);
  });

  it.each([
    ["register", "register", HttpStatus.CREATED],
    ["registerTransporter", "register/transporter", HttpStatus.CREATED],
    ["registerCarPuller", "register/car-puller", HttpStatus.CREATED],
    ["login", "login", HttpStatus.OK],
    ["loginMultiTenant", "login/multi-tenant", HttpStatus.OK],
  ] as const)(
    "declares the %s route as %s with status %s",
    (methodName, path, status) => {
      const method = controller[methodName];

      expect(Reflect.getMetadata(PATH_METADATA, method)).toBe(path);
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, method)).toBe(status);
    },
  );

  it.each([
    new ConflictException("An account with this email already exists."),
    new ServiceUnavailableException("Authentication provider is unavailable."),
    new InternalServerErrorException("Registration could not be completed."),
  ])(
    "propagates safe registration HTTP exceptions unchanged",
    async (error) => {
      register.mockRejectedValue(error);

      await expect(controller.register({} as RegisterDto)).rejects.toBe(error);
    },
  );

  it.each([
    new UnauthorizedException("Invalid email or password."),
    new ForbiddenException("Account access is not configured."),
    new ServiceUnavailableException("Authentication provider is unavailable."),
    new InternalServerErrorException("Login could not be completed."),
  ])("propagates safe login HTTP exceptions unchanged", async (error) => {
    login.mockRejectedValue(error);

    await expect(controller.login({} as LoginDto)).rejects.toBe(error);
  });
});
