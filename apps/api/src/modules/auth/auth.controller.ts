import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import {
  AuthResponseDto,
  MultiTenantAuthResponseDto,
} from "./dto/auth-response.dto";
import { LoginDto } from "./dto/login.dto";
import { RegisterCarPullerDto } from "./dto/register-car-puller.dto";
import { RegisterTransporterDto } from "./dto/register-transporter.dto";
import { RegisterDto } from "./dto/register.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: AuthResponseDto })
  register(@Body() input: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(input);
  }

  @Post("register/transporter")
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: MultiTenantAuthResponseDto })
  registerTransporter(
    @Body() input: RegisterTransporterDto,
  ): Promise<MultiTenantAuthResponseDto> {
    return this.authService.registerTransporter(input);
  }

  @Post("register/car-puller")
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: MultiTenantAuthResponseDto })
  registerCarPuller(
    @Body() input: RegisterCarPullerDto,
  ): Promise<MultiTenantAuthResponseDto> {
    return this.authService.registerCarPuller(input);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  login(@Body() input: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(input);
  }

  @Post("login/multi-tenant")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MultiTenantAuthResponseDto })
  loginMultiTenant(
    @Body() input: LoginDto,
  ): Promise<MultiTenantAuthResponseDto> {
    return this.authService.loginMultiTenant(input);
  }
}
