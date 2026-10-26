import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/clock';
import type { UnitOfWork } from '../../../infrastructure/database/TransactionRunner.port';
import {
  SESSION_REVOCATION_REPOSITORY,
  type SessionRevocationRepository,
} from './Identity.port';

/**
 * Ends every session of an account in the caller's unit (D9): the
 * `token_version` bump kills live access tokens, the revoke kills every
 * refresh token. The service registers no `afterCommit` callback: the
 * caller owns the `VersionCache` drop and registers it on its own unit.
 */
@Injectable()
export class SessionRevocationService {
  constructor(
    @Inject(SESSION_REVOCATION_REPOSITORY)
    private readonly sessions: SessionRevocationRepository,
    private readonly clock: Clock,
  ) {}

  revokeAll(unit: UnitOfWork, accountId: number): Promise<void> {
    return this.sessions.revokeAll(unit, accountId, new Date(this.clock.now()));
  }
}
