import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AccessTokenService } from './access-token.service';
import { AllowedOriginGuard } from './allowed-origin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard, JwtStrategy } from './jwt.strategy';
import { RefreshTokenService } from './refresh-token.service';

/** Login, JWT access tokens and refresh-token rotation (T09). */
@Module({
  imports: [DatabaseModule, PassportModule],
  controllers: [AuthController],
  providers: [
    AccessTokenService,
    AllowedOriginGuard,
    AuthService,
    JwtAuthGuard,
    JwtStrategy,
    RefreshTokenService,
  ],
  exports: [JwtAuthGuard],
})
export class IdentityModule {}
