import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse } from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { LoginDto } from "./dto/login.dto";
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

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthResponseDto })
  login(@Body() input: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(input);
  }
}
