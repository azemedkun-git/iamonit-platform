import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_ADMIN_CLIENT,
  SUPABASE_PUBLIC_CLIENT,
} from "../../common/supabase/supabase.constants";
import { AuthRepository } from "./auth.repository";
import {
  AUTH_ROLES,
  AuthBootstrapResponse,
  AuthenticatedIdentity,
  AuthResponse,
  AuthSession,
  MembershipSummary,
  MultiTenantAuthResponse,
} from "./auth.types";
import { LoginDto } from "./dto/login.dto";
import { RegisterCarPullerDto } from "./dto/register-car-puller.dto";
import { RegisterTransporterDto } from "./dto/register-transporter.dto";
import { RegisterDto } from "./dto/register.dto";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly repository: AuthRepository;

  constructor(
    @Inject(SUPABASE_PUBLIC_CLIENT)
    private readonly publicClient: SupabaseClient,
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly adminClient: SupabaseClient,
    configService: ConfigService,
    @Optional() repository?: AuthRepository,
  ) {
    this.repository =
      repository ??
      new AuthRepository(configService.getOrThrow<string>("databaseUrl"));
  }

  async register(input: RegisterDto): Promise<AuthResponse> {
    let authResult;

    try {
      authResult = await this.publicClient.auth.signUp({
        email: input.email,
        password: input.password,
      });
    } catch (error) {
      throw this.mapProviderError(error);
    }

    if (authResult.error) {
      throw this.mapProviderError(authResult.error);
    }

    const authUser = authResult.data.user;

    if (!authUser) {
      throw new InternalServerErrorException(
        "Registration could not be completed.",
      );
    }

    let tenantId: string;

    try {
      ({ tenantId } = await this.repository.createCompanyAccount({
        authUserId: authUser.id,
        companyName: input.companyName,
        fullName: input.fullName,
        phone: input.phone,
      }));
    } catch (databaseError) {
      try {
        const compensation = await this.adminClient.auth.admin.deleteUser(
          authUser.id,
        );

        if (compensation.error) {
          throw new Error("Auth compensation was rejected.");
        }
      } catch {
        this.logger.error(
          `Auth compensation failed for orphaned user ${authUser.id}.`,
        );
        throw new InternalServerErrorException(
          "Registration could not be completed.",
        );
      }

      throw this.mapDatabaseError(databaseError);
    }

    const session = authResult.data.session;

    return {
      session: session ? this.toSession(session) : null,
      requiresEmailConfirmation: session === null,
      user: {
        id: authUser.id,
        email: authUser.email ?? input.email,
        tenantId,
        role: "admin",
        fullName: input.fullName,
        phone: input.phone,
      },
    };
  }

  async login(input: LoginDto): Promise<AuthResponse> {
    let authResult;

    try {
      authResult = await this.publicClient.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
    } catch (error) {
      throw this.mapLoginProviderError(error);
    }

    if (authResult.error) {
      throw this.mapLoginProviderError(authResult.error);
    }

    const { session, user } = authResult.data;

    if (!session || !user || !user.email) {
      throw new InternalServerErrorException("Login could not be completed.");
    }

    let profile;

    try {
      profile = await this.repository.findAppUserById(user.id);
    } catch (error) {
      throw this.mapLoginDatabaseError(error);
    }

    if (!profile) {
      throw new ForbiddenException("Account access is not configured.");
    }

    if (
      profile.id !== user.id ||
      !profile.tenantId ||
      !profile.fullName ||
      !profile.phone ||
      !AUTH_ROLES.includes(profile.role)
    ) {
      throw new InternalServerErrorException("Login could not be completed.");
    }

    return {
      session: this.toSession(session),
      requiresEmailConfirmation: false,
      user: {
        id: profile.id,
        email: user.email,
        tenantId: profile.tenantId,
        role: profile.role,
        fullName: profile.fullName,
        phone: profile.phone,
      },
    };
  }

  async registerTransporter(
    input: RegisterTransporterDto,
  ): Promise<MultiTenantAuthResponse> {
    const authResult = await this.signUp(input.email, input.password);
    const authUser = authResult.data.user;

    if (!authUser) {
      throw new InternalServerErrorException(
        "Registration could not be completed.",
      );
    }

    if (!isNewAuthIdentity(authUser)) {
      throw new ConflictException("An account with this email already exists.");
    }

    let account;

    try {
      account = await this.repository.createTransporterAccount({
        authUserId: authUser.id,
        companyName: input.companyName,
        fullName: input.fullName,
        phone: input.phone,
      });
    } catch (databaseError) {
      await this.compensateNewAuthIdentity(authUser.id);
      throw this.mapMultiTenantRegistrationDatabaseError(databaseError);
    }

    const session = authResult.data.session;

    return {
      session: session ? this.toSession(session) : null,
      requiresEmailConfirmation: session === null,
      profile: {
        ...account.profile,
        email: authUser.email ?? input.email,
      },
      memberships: [account.membership],
      selectedMembership: account.membership,
    };
  }

  async registerCarPuller(
    input: RegisterCarPullerDto,
  ): Promise<MultiTenantAuthResponse> {
    const authResult = await this.signUp(input.email, input.password);
    const authUser = authResult.data.user;

    if (!authUser) {
      throw new InternalServerErrorException(
        "Registration could not be completed.",
      );
    }

    if (!isNewAuthIdentity(authUser)) {
      throw new ConflictException("An account with this email already exists.");
    }

    let profile;

    try {
      profile = await this.repository.createUserProfile({
        authUserId: authUser.id,
        fullName: input.fullName,
        phone: input.phone,
      });
    } catch (databaseError) {
      await this.compensateNewAuthIdentity(authUser.id);
      throw this.mapMultiTenantRegistrationDatabaseError(databaseError);
    }

    const session = authResult.data.session;

    return {
      session: session ? this.toSession(session) : null,
      requiresEmailConfirmation: session === null,
      profile: {
        ...profile,
        email: authUser.email ?? input.email,
      },
      memberships: [],
      selectedMembership: null,
    };
  }

  async loginMultiTenant(input: LoginDto): Promise<MultiTenantAuthResponse> {
    let authResult;

    try {
      authResult = await this.publicClient.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
    } catch (error) {
      throw this.mapLoginProviderError(error);
    }

    if (authResult.error) {
      throw this.mapLoginProviderError(authResult.error);
    }

    const { session, user } = authResult.data;

    if (!session || !user || !user.email) {
      throw new InternalServerErrorException("Login could not be completed.");
    }

    let profile;
    let memberships: MembershipSummary[];

    try {
      profile = await this.repository.findUserProfileById(user.id);
      memberships = await this.repository.findActiveMembershipsByUserId(
        user.id,
      );
    } catch (error) {
      throw this.mapLoginDatabaseError(error);
    }

    if (!profile) {
      throw new ForbiddenException("Account access is not configured.");
    }

    if (
      profile.userId !== user.id ||
      !profile.fullName ||
      !profile.phone ||
      memberships.some((membership) => !isValidActiveMembership(membership))
    ) {
      throw new InternalServerErrorException("Login could not be completed.");
    }

    return {
      session: this.toSession(session),
      requiresEmailConfirmation: false,
      profile: { ...profile, email: user.email },
      memberships,
      selectedMembership: memberships.length === 1 ? memberships[0] : null,
    };
  }

  async getCurrentUser(
    identity: AuthenticatedIdentity,
  ): Promise<AuthBootstrapResponse> {
    let profile;
    let memberships: MembershipSummary[];

    try {
      profile = await this.repository.findBootstrapProfileByUserId(
        identity.userId,
      );
      memberships = await this.repository.findActiveMembershipsByUserId(
        identity.userId,
      );
    } catch (error) {
      throw this.mapBootstrapDatabaseError(error);
    }

    if (!profile) {
      throw new ForbiddenException("Account access is not configured.");
    }

    if (
      profile.userId !== identity.userId ||
      !profile.email ||
      !profile.fullName ||
      !profile.phone ||
      memberships.some((membership) => !isValidActiveMembership(membership))
    ) {
      throw new InternalServerErrorException(
        "Account bootstrap could not be completed.",
      );
    }

    return {
      profile,
      memberships,
      selectedMembership: memberships.length === 1 ? memberships[0] : null,
    };
  }

  private async signUp(email: string, password: string) {
    let authResult;

    try {
      authResult = await this.publicClient.auth.signUp({ email, password });
    } catch (error) {
      throw this.mapProviderError(error);
    }

    if (authResult.error) {
      throw this.mapProviderError(authResult.error);
    }

    return authResult;
  }

  private async compensateNewAuthIdentity(authUserId: string): Promise<void> {
    try {
      const compensation =
        await this.adminClient.auth.admin.deleteUser(authUserId);

      if (compensation.error) {
        throw new Error("Auth compensation was rejected.");
      }
    } catch {
      this.logger.error(
        `Auth compensation failed for orphaned user ${authUserId}.`,
      );
      throw new InternalServerErrorException(
        "Registration could not be completed.",
      );
    }
  }

  private toSession(session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    expires_at?: number;
    token_type: string;
  }): AuthSession {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresIn: session.expires_in,
      expiresAt: session.expires_at ?? 0,
      tokenType: session.token_type,
    };
  }

  private mapProviderError(error: unknown): Error {
    if (isDuplicateEmailError(error)) {
      return new ConflictException(
        "An account with this email already exists.",
      );
    }

    if (isUnavailableError(error)) {
      return new ServiceUnavailableException(
        "Authentication provider is unavailable.",
      );
    }

    return new InternalServerErrorException(
      "Registration could not be completed.",
    );
  }

  private mapDatabaseError(error: unknown): Error {
    if (isPostgresError(error) && error.code === "23505") {
      return new ConflictException(
        error.constraint?.includes("tenant")
          ? "A company with this name already exists."
          : "An account with this email already exists.",
      );
    }

    if (isUnavailableError(error)) {
      return new ServiceUnavailableException("Database is unavailable.");
    }

    return new InternalServerErrorException(
      "Registration could not be completed.",
    );
  }

  private mapMultiTenantRegistrationDatabaseError(error: unknown): Error {
    if (isPostgresError(error) && error.code === "23505") {
      return new ConflictException(
        "An account with this email already exists.",
      );
    }

    return this.mapDatabaseError(error);
  }

  private mapLoginProviderError(error: unknown): Error {
    if (isUnavailableError(error)) {
      return new ServiceUnavailableException(
        "Authentication provider is unavailable.",
      );
    }

    if (isInvalidCredentialsError(error)) {
      return new UnauthorizedException("Invalid email or password.");
    }

    return new InternalServerErrorException("Login could not be completed.");
  }

  private mapLoginDatabaseError(error: unknown): Error {
    if (isUnavailableError(error)) {
      return new ServiceUnavailableException("Database is unavailable.");
    }

    return new InternalServerErrorException("Login could not be completed.");
  }

  private mapBootstrapDatabaseError(error: unknown): Error {
    if (isUnavailableError(error)) {
      return new ServiceUnavailableException("Database is unavailable.");
    }

    return new InternalServerErrorException(
      "Account bootstrap could not be completed.",
    );
  }
}

interface ErrorDetails {
  code?: string;
  constraint?: string;
  message?: string;
  status?: number;
}

function errorDetails(error: unknown): ErrorDetails {
  return typeof error === "object" && error !== null
    ? (error as ErrorDetails)
    : {};
}

function isPostgresError(error: unknown): error is ErrorDetails {
  return typeof errorDetails(error).code === "string";
}

function isDuplicateEmailError(error: unknown): boolean {
  const details = errorDetails(error);
  const message = details.message?.toLowerCase() ?? "";

  return (
    details.code === "user_already_exists" ||
    message.includes("already registered") ||
    message.includes("already exists")
  );
}

function isUnavailableError(error: unknown): boolean {
  const details = errorDetails(error);

  return (
    (typeof details.status === "number" && details.status >= 500) ||
    details.code?.startsWith("08") === true ||
    ["57P01", "57P02", "57P03", "ECONNREFUSED", "ETIMEDOUT"].includes(
      details.code ?? "",
    )
  );
}

function isInvalidCredentialsError(error: unknown): boolean {
  const details = errorDetails(error);
  const message = details.message?.toLowerCase() ?? "";

  return (
    details.code === "invalid_credentials" ||
    (details.status === 400 && message.includes("invalid login credentials"))
  );
}

function isNewAuthIdentity(user: { identities?: unknown[] }): boolean {
  return user.identities === undefined || user.identities.length > 0;
}

function isValidActiveMembership(membership: MembershipSummary): boolean {
  return (
    Boolean(
      membership.membershipId && membership.tenantId && membership.tenantName,
    ) &&
    membership.status === "active" &&
    AUTH_ROLES.includes(membership.role)
  );
}
