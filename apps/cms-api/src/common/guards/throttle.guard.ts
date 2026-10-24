import { createHash } from 'node:crypto';

import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { ClientIpResolver } from '../http/client-ip.resolver';
import { Clock } from '../time/clock';
import { MS_PER_SECOND } from '../constants/time.constants';
import { ERROR_CODES } from '../constants/error.constants';
import {
  RATE_LIMIT_KEY_HASH_ALGORITHM,
  RATE_LIMIT_KEY_SOURCES,
  RATE_LIMIT_MESSAGE,
  type RateLimitPolicy,
  type RateLimitRule,
  RETRY_AFTER_HEADER,
  RETRY_AFTER_MIN_SECONDS,
} from '../constants/limits.constants';
import {
  RATE_LIMIT_STORE,
  type RateLimitStore,
} from '../rate-limit/rate-limit.store';
import {
  THROTTLE_SUBJECT_RESOLVER,
  type ThrottleSubjectResolver,
} from '../rate-limit/throttle-subject-resolver';

export const RATE_LIMIT_POLICY_METADATA = 'abyss:rate-limit-policy';

/**
 * Throttles a route with a policy of its own module, e.g.
 * `@Throttle(IDENTITY_RATE_LIMIT_POLICIES.LOGIN)`. Put it last (closest to the method)
 * so it runs before the route's other guards.
 */
export function Throttle(policy: RateLimitPolicy): MethodDecorator {
  return applyDecorators(
    SetMetadata(RATE_LIMIT_POLICY_METADATA, policy),
    UseGuards(ThrottleGuard),
  );
}

/**
 * Email key: trimmed + lower-cased (same as account emails, which are
 * citext), then hashed so the key size is bounded and no plain email sits in
 * memory. It never touches the database, so known and unknown emails are
 * throttled identically. Non-string or empty emails are not counted (the
 * route answers 400 for them anyway).
 */
function emailKeyOf(req: Request): string | undefined {
  const body = req.body as Record<string, unknown> | undefined;
  const email = body?.['email'];
  if (typeof email !== 'string') return undefined;
  const normalized = email.trim().toLowerCase();
  if (normalized === '') return undefined;
  return createHash(RATE_LIMIT_KEY_HASH_ALGORITHM)
    .update(normalized)
    .digest('hex');
}

function counterKeyOf(
  rule: RateLimitRule,
  req: Request,
  clientIp: ClientIpResolver,
  actors: ThrottleSubjectResolver,
): string | undefined {
  switch (rule.keySource) {
    case RATE_LIMIT_KEY_SOURCES.IP:
      return clientIp.resolve(req);
    case RATE_LIMIT_KEY_SOURCES.ANONYMOUS_IP:
      return actors.isAnonymousRequest(req) ? clientIp.resolve(req) : undefined;
    case RATE_LIMIT_KEY_SOURCES.EMAIL:
      return emailKeyOf(req);
    case RATE_LIMIT_KEY_SOURCES.ACTOR:
      return actors.accountSubjectOf(req);
  }
}

/**
 * Fixed-window throttle (D7). Each rule of the policy counts one hit per
 * request under `<rule name>:<IP | email hash>`; the first rule over its
 * limit answers 429 in the unified error shape with `Retry-After`. The body
 * and header are the same whichever rule fired.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly clientIp: ClientIpResolver,
    @Inject(RATE_LIMIT_STORE) private readonly store: RateLimitStore,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
    @Inject(THROTTLE_SUBJECT_RESOLVER)
    private readonly subjectResolver: ThrottleSubjectResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rules = this.reflector.get<readonly RateLimitRule[] | undefined>(
      RATE_LIMIT_POLICY_METADATA,
      context.getHandler(),
    );
    if (rules === undefined) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    for (const rule of rules) {
      const counterKey = counterKeyOf(
        rule,
        req,
        this.clientIp,
        this.subjectResolver,
      );
      if (counterKey === undefined) continue;

      const hit = await this.store.hit(
        `${rule.name}:${counterKey}`,
        rule.windowMs,
      );
      // A refused hit (store at capacity) answers exactly like a limit hit.
      if (hit.isRefused === true || hit.count > this.limitOf(rule)) {
        this.reject(http.getResponse<Response>(), hit.resetAt);
      }
    }
    return true;
  }

  /** The default limit, unless the config overrides the env key the rule declares. */
  private limitOf(rule: RateLimitRule): number {
    if (rule.limitOverrideEnvKey === undefined) return rule.maxHits;
    return (
      this.config.rateLimit.limitOverrides[rule.limitOverrideEnvKey] ??
      rule.maxHits
    );
  }

  private reject(res: Response, resetAt: number): never {
    const seconds = Math.max(
      RETRY_AFTER_MIN_SECONDS,
      Math.ceil((resetAt - this.clock.now()) / MS_PER_SECOND),
    );
    res.setHeader(RETRY_AFTER_HEADER, String(seconds));
    throw new HttpException(
      { errorCode: ERROR_CODES.TOO_MANY_REQUESTS, message: RATE_LIMIT_MESSAGE },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
