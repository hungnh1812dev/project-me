import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import type { ThrottleSubjectResolver } from '../../common/rate-limit/throttle-subject-resolver';

type RequestWithActor = Request & {
  user?: { actor?: { kind?: unknown; accountId?: unknown } };
};

/** Reads the actor an earlier guard put on the request. */
@Injectable()
export class ActorThrottleSubjectResolver implements ThrottleSubjectResolver {
  accountSubjectOf(req: Request): string | undefined {
    const actor = (req as RequestWithActor).user?.actor;
    if (actor?.kind !== 'account' || typeof actor.accountId !== 'number') {
      return undefined;
    }
    return String(actor.accountId);
  }

  isAnonymousRequest(req: Request): boolean {
    return (req as RequestWithActor).user?.actor?.kind === 'anonymous';
  }
}
