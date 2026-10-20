import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { MailModule } from '../../infrastructure/mail/mail.module';
import { AccessTokenService } from './access-token.service';
import { AllowedOriginGuard } from './allowed-origin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, JwtStrategy } from './jwt.strategy';
import { OtpService } from './otp.service';
import { PasswordController } from './password.controller';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';
import {
  FailClosedResetSecondFactor,
  RESET_SECOND_FACTOR,
} from './reset-second-factor';

/** Login, JWT, refresh rotation (T09); OTP + password lifecycle (T12). */
@Module({
  imports: [DatabaseModule, MailModule, PassportModule],
  controllers: [AuthController, PasswordController],
  providers: [
    AccessTokenService,
    AllowedOriginGuard,
    AuthService,
    JwtAuthGuard,
    JwtStrategy,
    OtpService,
    PasswordService,
    RefreshTokenService,
    // TODO(T13): bind to the real TOTP verifier.
    { provide: RESET_SECOND_FACTOR, useClass: FailClosedResetSecondFactor },
  ],
  exports: [JwtAuthGuard, OtpService],
})
export class IdentityModule {}
