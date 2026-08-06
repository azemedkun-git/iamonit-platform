import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  InternalServerErrorException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { HTTP_CODE_METADATA } from "@nestjs/common/constants";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthResponse } from "./auth.types";
import { LoginDto } from "./dto/login.dto";
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

  let controller: AuthController;
  let register: jest.MockedFunction<AuthService["register"]>;
  let login: jest.MockedFunction<AuthService["login"]>;

  beforeEach(() => {
    register = jest.fn();
    login = jest.fn();
    controller = new AuthController({
      register,
      login,
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
