import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { AccessModule } from '../access/access.module';
import { AccessTokenService } from './access-token.service';
import { AllowedOriginGuard } from './allowed-origin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, JwtStrategy } from './jwt.strategy';
import { OtpService } from './otp.service';
import { PasswordController } from './password.controller';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import { SecretBox } from './crypto/secret-box';
import { RESET_SECOND_FACTOR } from './reset-second-factor';
import { TotpService } from './totp.service';
import { TwoFactorChallengeStore } from './two-factor-challenge.store';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

/** Login, JWT, refresh rotation (T09); OTP + password lifecycle (T12); 2FA (T13). */
@Module({
  imports: [AccessModule, DatabaseModule, MailModule, PassportModule],
  controllers: [AuthController, PasswordController, TwoFactorController],
  providers: [
    AccessTokenService,
    AllowedOriginGuard,
    AuthService,
    JwtAuthGuard,
    JwtStrategy,
    OtpService,
    PasswordService,
    RefreshTokenService,
    SecretBox,
    TotpService,
    TwoFactorChallengeStore,
    TwoFactorService,
    // D8: a reset of a TOTP account needs a valid authenticator code.
    { provide: RESET_SECOND_FACTOR, useExisting: TotpService },
  ],
  exports: [JwtAuthGuard, OtpService],
})
export class IdentityModule {}
