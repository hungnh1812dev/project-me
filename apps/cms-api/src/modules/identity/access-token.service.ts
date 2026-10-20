import { Inject, Injectable } from '@nestjs/common';
import { decode, sign } from 'jsonwebtoken';
import { z } from 'zod';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_ERROR_MESSAGES,
  JWT_ALGORITHM,
  TOKEN_TYPES,
  TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS,
} from '../../common/constants/auth.constants';
import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';

/** D9 access-token claims (plus the `typ` discriminator and JWT `iat`/`exp`). */
export const accessTokenClaimsSchema = z.object({
  sub: z.uuid(),
  tv: z.int(),
  pv: z.int(),
  kid: z.string(),
  typ: z.literal(TOKEN_TYPES.ACCESS),
});

export type AccessTokenClaims = z.infer<typeof accessTokenClaimsSchema>;

export interface AccessTokenSubject {
  /** `accounts.document_id` (never the sequential id). */
  readonly sub: string;
  /** `accounts.token_version`. */
  readonly tv: number;
  /** `roles.policy_version`. */
  readonly pv: number;
}

/**
 * Signs HS256 JWTs with the key named by `kid` and resolves the verification
 * key for an incoming token from its `kid`. Verification itself (alg pinning,
 * expiry) runs in passport-jwt, see `jwt.strategy.ts`.
 */
@Injectable()
export class AccessTokenService {
  private readonly kid: string;
  /** kid -> secret. One entry today; more kids would allow key rotation. */
  private readonly keys: ReadonlyMap<string, string>;

  constructor(@Inject(APP_CONFIG) config: IAppConfig) {
    this.kid = config.auth.jwtAccessKid;
    const secret = config.secrets.jwtAccessSecret;
    this.keys = new Map(secret === undefined ? [] : [[this.kid, secret]]);
  }

  signAccessToken(subject: AccessTokenSubject): string {
    return this.sign(
      { ...subject, typ: TOKEN_TYPES.ACCESS },
      ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  /**
   * STUB until T13: a signed, short-lived `typ: 2fa` token. T13 adds the
   * verify endpoint and the 5-attempt limit; nothing accepts it yet.
   */
  signTwoFactorTempToken(sub: string): string {
    return this.sign(
      { sub, typ: TOKEN_TYPES.TWO_FACTOR },
      TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS,
    );
  }

  /**
   * Verification key for a raw token: its header `kid` must name a configured
   * key and match the `kid` claim. Undefined = reject without verifying.
   */
  keyFor(rawToken: string): string | undefined {
    const decoded = decode(rawToken, { complete: true });
    if (decoded === null || typeof decoded.payload === 'string') {
      return undefined;
    }
    const headerKid = decoded.header.kid;
    if (headerKid === undefined || decoded.payload['kid'] !== headerKid) {
      return undefined;
    }
    return this.keys.get(headerKid);
  }

  private sign(payload: Record<string, unknown>, ttlSeconds: number): string {
    const secret = this.keys.get(this.kid);
    if (secret === undefined) {
      throw new Error(AUTH_ERROR_MESSAGES.JWT_NOT_CONFIGURED);
    }
    return sign({ ...payload, kid: this.kid }, secret, {
      algorithm: JWT_ALGORITHM,
      keyid: this.kid,
      expiresIn: ttlSeconds,
    });
  }
}
