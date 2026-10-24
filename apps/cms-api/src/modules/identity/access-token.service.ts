import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { decode, sign, verify } from 'jsonwebtoken';
import { z } from 'zod';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_ERROR_MESSAGES,
  JWT_ALGORITHM,
  REVIEWER_SESSION_TTL_SECONDS,
  TOKEN_TYPES,
  TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS,
} from './identity-auth.constants';
import { Clock } from '../../common/time/clock';
import { MS_PER_SECOND } from '../../common/constants/time.constants';
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

/** 2FA temp token claims. `jti` keys the attempt counter. */
const twoFactorTempTokenClaimsSchema = z.object({
  sub: z.uuid(),
  tv: z.int(),
  jti: z.uuid(),
  kid: z.string(),
  typ: z.literal(TOKEN_TYPES.TWO_FACTOR),
  exp: z.int(),
});

export type TwoFactorTempTokenClaims = z.infer<
  typeof twoFactorTempTokenClaimsSchema
>;

/** Who a temp token is for: the account and its token_version at login. */
export interface TwoFactorTempTokenSubject {
  readonly sub: string;
  readonly tv: number;
}

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

  constructor(
    @Inject(APP_CONFIG) config: IAppConfig,
    private readonly clock: Clock,
  ) {
    this.kid = config.auth.jwtAccessKid;
    const secret = config.secrets.jwtAccessSecret;
    this.keys = new Map(secret === undefined ? [] : [[this.kid, secret]]);
  }

  /** The 15 min access token. */
  signAccessToken(subject: AccessTokenSubject): string {
    return this.sign(
      { ...subject, typ: TOKEN_TYPES.ACCESS },
      ACCESS_TOKEN_TTL_SECONDS,
    );
  }

  /** The 24 h access token of a reviewer session; same claims and `typ` as any access token. */
  signReviewerSessionToken(subject: AccessTokenSubject): string {
    return this.sign(
      { ...subject, typ: TOKEN_TYPES.ACCESS },
      REVIEWER_SESSION_TTL_SECONDS,
    );
  }

  /**
   * The short-lived `typ: 2fa` token of a password-checked login (SPEC §6:
   * 300 s). Its `jti` keys the 5-attempt counter (TwoFactorChallengeStore).
   */
  signTwoFactorTempToken(subject: TwoFactorTempTokenSubject): string {
    // `iat` (and so `exp`) from Clock, so tests can move past the 300 s.
    return this.sign(
      {
        sub: subject.sub,
        tv: subject.tv,
        typ: TOKEN_TYPES.TWO_FACTOR,
        iat: this.nowSeconds(),
      },
      TWO_FACTOR_TEMP_TOKEN_TTL_SECONDS,
      randomUUID(),
    );
  }

  /**
   * Verifies a temp token (HS256 only, kid-matched key, not expired) and
   * returns its claims, or undefined. Access tokens fail on `typ`.
   */
  verifyTwoFactorTempToken(
    rawToken: string,
  ): TwoFactorTempTokenClaims | undefined {
    const key = this.keyFor(rawToken);
    if (key === undefined) return undefined;
    try {
      const payload = verify(rawToken, key, {
        algorithms: [JWT_ALGORITHM],
        clockTimestamp: this.nowSeconds(),
      });
      const parsed = twoFactorTempTokenClaimsSchema.safeParse(payload);
      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
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

  private nowSeconds(): number {
    return Math.floor(this.clock.now() / MS_PER_SECOND);
  }

  private sign(
    payload: Record<string, unknown>,
    ttlSeconds: number,
    jwtId?: string,
  ): string {
    const secret = this.keys.get(this.kid);
    if (secret === undefined) {
      throw new Error(AUTH_ERROR_MESSAGES.JWT_NOT_CONFIGURED);
    }
    return sign({ ...payload, kid: this.kid }, secret, {
      algorithm: JWT_ALGORITHM,
      keyid: this.kid,
      expiresIn: ttlSeconds,
      ...(jwtId === undefined ? {} : { jwtid: jwtId }),
    });
  }
}
