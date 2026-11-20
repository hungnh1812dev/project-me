import {
  applyDecorators,
  Injectable,
  Logger,
  SetMetadata,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { DomainError } from '../../../common/errors/Domain.errors';
import { ClientIpResolver, clientMetaOf } from '../../../common/http/ClientIp.resolver';
import { HumanCheckService } from '../application/HumanCheck.service';
import { TURNSTILE_TOKEN_FIELD, type HumanCheckForm } from '../domain/HumanCheck.rules';

/** Metadata key of `@RequireHumanCheck()` (read by `HumanCheckGuard`). */
export const HUMAN_CHECK_METADATA_KEY = 'abyss:human-check:form';

/** The route label logged with a refusal, when Express has not matched a route. */
const UNMATCHED_ROUTE = 'unmatched';

/**
 * Verifies the body's `turnstileToken` for one form id before the route's
 * request schema and any credential or database work (D25). A refusal fails
 * closed and is logged with the route and error code only, never the token.
 */
@Injectable()
export class HumanCheckGuard implements CanActivate {
  private readonly logger = new Logger(HumanCheckGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly humanCheck: HumanCheckService,
    private readonly clientIp: ClientIpResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const formId = this.reflector.getAllAndOverride<HumanCheckForm | undefined>(
      HUMAN_CHECK_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    // A route without the decorator was never protected: refuse instead of letting it through.
    if (formId === undefined) throw new Error('HumanCheckGuard needs @RequireHumanCheck(formId).');

    const request = context.switchToHttp().getRequest<Request>();
    try {
      await this.humanCheck.assertPassed(
        formId,
        tokenOf(request.body),
        clientMetaOf(this.clientIp, request).ip,
      );
    } catch (error) {
      if (error instanceof DomainError) {
        this.logger.warn(
          `Human check refused ${request.method} ${routeOf(request)}: ${error.errorCode}`,
        );
      }
      throw error;
    }
    return true;
  }
}

function routeOf(request: Request): string {
  const route = request.route as { path?: string } | undefined;
  return route?.path ?? UNMATCHED_ROUTE;
}

function tokenOf(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return undefined;
  return (body as Record<string, unknown>)[TURNSTILE_TOKEN_FIELD];
}

/**
 * Marks a route as protected by the human check for `formId`. Put it above
 * `@Throttle(...)` so the rate limit runs first (guards run bottom to top).
 */
export const RequireHumanCheck = (formId: HumanCheckForm) =>
  applyDecorators(SetMetadata(HUMAN_CHECK_METADATA_KEY, formId), UseGuards(HumanCheckGuard));
