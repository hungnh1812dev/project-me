import {
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { type IAppConfig } from '../../config/AppConfig.setup';
import { APP_CONFIG } from '../../config/Config.constants';
import { DatabaseModule } from '../../infrastructure/database/Database.module';
import { MailModule } from '../../infrastructure/mail/Mail.module';
import { AccessModule } from '../access';
import { SecurityAuditModule, SecurityAuditService } from '../security-audit';
import { PrismaAccountRepository } from './adapters/PrismaAccount.repository';
import { PrismaOtpCodeRepository } from './adapters/PrismaOtpCode.repository';
import { PrismaRefreshTokenRepository } from './adapters/PrismaRefreshToken.repository';
import { PrismaSessionRevocationRepository } from './adapters/PrismaSessionRevocation.repository';
import { AccessSessionService } from './application/AccessSession.service';
import { AccessTokenService } from './application/AccessToken.service';
import { AuthService } from './application/Auth.service';
import {
  ACCEPTS_REVIEWER_TOKENS,
  ACCOUNT_REPOSITORY,
  AUDIT_RECORDER,
  OTP_CODE_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  RESET_SECOND_FACTOR,
  SESSION_REVOCATION_REPOSITORY,
} from './application/Identity.port';
import { OtpService } from './application/Otp.service';
import { OwnerBootstrapService } from './application/OwnerBootstrap.service';
import { OwnerSetupService } from './application/OwnerSetup.service';
import { PasswordService } from './application/Password.service';
import { ReauthenticationService } from './application/Reauthentication.service';
import { RefreshTokenService } from './application/RefreshToken.service';
import { SecretBox } from './application/SecretBox.service';
import { SessionRevocationService } from './application/SessionRevocation.service';
import { TotpService } from './application/Totp.service';
import { TwoFactorChallengeStore } from './application/TwoFactorChallenge.store';
import { TwoFactorEmailCodeService } from './application/TwoFactorEmailCode.service';
import { TwoFactorLoginService } from './application/TwoFactorLogin.service';
import { TwoFactorManagementService } from './application/TwoFactorManagement.service';
import { AllowedOriginGuard } from './http/AllowedOrigin.guard';
import { AuthController } from './http/Auth.controller';
import { JwtAuthGuard, JwtStrategy } from './http/Jwt.strategy';
import { OwnerSetupController } from './http/OwnerSetup.controller';
import { PasswordController } from './http/Password.controller';
import { TwoFactorController } from './http/TwoFactor.controller';

/** Login, JWT, refresh rotation; OTP + password lifecycle; 2FA. */
@Module({
  imports: [
    AccessModule,
    DatabaseModule,
    MailModule,
    PassportModule,
    SecurityAuditModule,
  ],
  controllers: [
    AuthController,
    OwnerSetupController,
    PasswordController,
    TwoFactorController,
  ],
  providers: [
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    { provide: OTP_CODE_REPOSITORY, useClass: PrismaOtpCodeRepository },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    {
      provide: SESSION_REVOCATION_REPOSITORY,
      useClass: PrismaSessionRevocationRepository,
    },
    { provide: AUDIT_RECORDER, useExisting: SecurityAuditService },
    {
      provide: ACCEPTS_REVIEWER_TOKENS,
      inject: [APP_CONFIG],
      useFactory: (config: IAppConfig) => config.reviewer.isFeatureEnabled,
    },
    AccessSessionService,
    AccessTokenService,
    AllowedOriginGuard,
    AuthService,
    JwtAuthGuard,
    JwtStrategy,
    OtpService,
    OwnerBootstrapService,
    OwnerSetupService,
    PasswordService,
    ReauthenticationService,
    RefreshTokenService,
    SecretBox,
    SessionRevocationService,
    TotpService,
    TwoFactorChallengeStore,
    TwoFactorEmailCodeService,
    TwoFactorLoginService,
    TwoFactorManagementService,
    // D8: a reset of a TOTP account needs a valid authenticator code.
    { provide: RESET_SECOND_FACTOR, useExisting: TotpService },
  ],
  exports: [
    AccessTokenService,
    JwtAuthGuard,
    OtpService,
    ReauthenticationService,
    SessionRevocationService,
  ],
})
export class IdentityModule
  implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
    private readonly ownerSetup: OwnerSetupService,
  ) {}

  /** Fails the start when the login dummy hash cannot be made. */
  async onModuleInit(): Promise<void> {
    await this.auth.ready();
  }

  /** Warns once when the setup token is still set after the owner exists. */
  async onApplicationBootstrap(): Promise<void> {
    await this.ownerSetup.warnWhenTokenOutlivesSetup();
  }

  /** Lets in-flight reset and invite mails finish before the process exits. */
  async onApplicationShutdown(): Promise<void> {
    await this.passwords.whenIdle();
  }
}
