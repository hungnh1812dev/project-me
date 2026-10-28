import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AccessPolicyService } from '../application/AccessPolicy.service';
import type {
  PermissionAction,
  SystemSubject,
} from '../domain/Access.constants';
import type { ActorContext } from '../domain/ActorContext.entity';

/** Metadata key of `@RequirePermission()` (read by `PermissionGuard`). */
export const PERMISSION_METADATA_KEY = 'abyss:access:permission';

/**
 * What a route needs. A system route names its subject; a content route
 * names the route param holding the content type slug (`:slug`), which the
 * guard resolves through the registry, never as SQL.
 */
export type PermissionRequirement =
  | { action: PermissionAction; subject: SystemSubject }
  | { action: PermissionAction; subjectParam: string };

/**
 * Declares the permission a handler needs. Only metadata: the guard below
 * reads it and calls `PolicyEvaluator.can()`.
 */
export const RequirePermission = (requirement: PermissionRequirement) =>
  SetMetadata(PERMISSION_METADATA_KEY, requirement);

/** What an authentication guard must leave on `req.user` for this guard. */
interface WithActor {
  user?: { actor?: ActorContext };
}

/**
 * Enforces `@RequirePermission()` with the PolicyEvaluator. Use it
 * after an authentication guard: `@UseGuards(JwtAuthGuard, PermissionGuard)`.
 * - no metadata -> allowed (the route needs authentication only);
 * - no actor on the request -> 401;
 * - `subjectParam` that is not a registered content type -> 404;
 * - not allowed -> 403 (unified error shape via the global filter).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<
      PermissionRequirement | undefined
    >(PERMISSION_METADATA_KEY, [context.getHandler(), context.getClass()]);
    if (requirement === undefined) return true;

    const request = context.switchToHttp().getRequest<Request & WithActor>();
    const actor = request.user?.actor;
    if (actor === undefined) throw new UnauthorizedException();

    const { catalog, evaluator } = await this.access.policy();
    let subject: string;
    if ('subject' in requirement) {
      subject = requirement.subject;
    } else {
      const param: unknown = request.params[requirement.subjectParam];
      if (typeof param !== 'string' || !catalog.isContentType(param)) {
        throw new NotFoundException();
      }
      subject = param;
    }
    if (!evaluator.can(actor, requirement.action, subject)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
