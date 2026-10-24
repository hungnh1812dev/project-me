import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { PERMISSION_METADATA_KEY } from './access.constants';
import { AccessPolicyService } from './access-policy.service';
import type { ActorContext } from './actor-context';
import type { PermissionRequirement } from './permission.decorator';

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
