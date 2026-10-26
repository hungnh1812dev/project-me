import {
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { AccessModule } from '../access';
import { SecurityAuditModule } from '../security-audit';
import { PrismaAccountRepository } from './adapters/PrismaAccount.repository';
import { PrismaOtpCodeRepository } from './adapters/PrismaOtpCode.repository';
import { PrismaRefreshTokenRepository } from './adapters/PrismaRefreshToken.repository';
import { PrismaSessionRevocationRepository } from './adapters/PrismaSessionRevocation.repository';
import { AccessTokenService } from './application/AccessToken.service';
import { AuthService } from './application/Auth.service';
import {
  ACCOUNT_REPOSITORY,
  OTP_CODE_REPOSITORY,
  REFRESH_TOKEN_REPOSITORY,
  RESET_SECOND_FACTOR,
  SESSION_REVOCATION_REPOSITORY,
} from './application/Identity.port';
import { OtpService } from './application/Otp.service';
import { PasswordService } from './application/Password.service';
import { RefreshTokenService } from './application/RefreshToken.service';
import { SecretBox } from './application/SecretBox.service';
import { SessionRevocationService } from './application/SessionRevocation.service';
import { TotpService } from './application/Totp.service';
import { TwoFactorChallengeStore } from './application/TwoFactorChallenge.store';
import { TwoFactorEmailCodeService } from './application/TwoFactorEmailCode.service';
import { TwoFactorLoginService } from './application/TwoFactorLogin.service';
import { TwoFactorManagementService } from './application/TwoFactorManagement.service';
import { AllowedOriginGuard } from './allowed-origin.guard';
import { AuthController } from './auth.controller';
import { JwtAuthGuard, JwtStrategy } from './jwt.strategy';
import { OwnerSetupController } from './owner-setup.controller';
import { OwnerSetupService } from './owner-setup.service';
import { PasswordController } from './password.controller';
import { TwoFactorController } from './two-factor.controller';

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
    AccessTokenService,
    AllowedOriginGuard,
    AuthService,
    JwtAuthGuard,
    JwtStrategy,
    OtpService,
    OwnerSetupService,
    PasswordService,
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
    SessionRevocationService,
  ],
})
export class IdentityModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    private readonly auth: AuthService,
    private readonly passwords: PasswordService,
  ) {}

  /** Fails the start when the login dummy hash cannot be made. */
  async onModuleInit(): Promise<void> {
    await this.auth.ready();
  }

  /** Lets in-flight reset and invite mails finish before the process exits. */
  async onApplicationShutdown(): Promise<void> {
    await this.passwords.whenIdle();
  }
}
