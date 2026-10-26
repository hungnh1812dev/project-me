import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/time/clock';
import { VersionCache } from '../../access';
import {
  REVIEWER_ACCOUNT_GATEWAY,
  type ReviewerAccountGateway,
} from './Reviewer.port';

const REVIEWER_CLEANUP_BATCH_SIZE = 100;

/**
 * Deletes reviewer accounts whose every session has expired. The session row
 * and refresh/OTP rows go with the account (cascade); audit rows keep their
 * text and lose only the actor link (SET NULL).
 */
@Injectable()
export class ReviewerCleanupService {
  private isRunning = false;

  constructor(
    @Inject(REVIEWER_ACCOUNT_GATEWAY)
    private readonly accounts: ReviewerAccountGateway,
    private readonly clock: Clock,
    private readonly versions: VersionCache,
  ) {}

  /** Returns how many accounts were deleted. */
  async run(): Promise<number> {
    if (this.isRunning) return 0;
    this.isRunning = true;
    try {
      let deleted = 0;
      for (;;) {
        const ids = await this.accounts.findExpiredAccountIds(
          this.clock.now(),
          REVIEWER_CLEANUP_BATCH_SIZE,
        );
        if (ids.length === 0) return deleted;
        await this.accounts.deleteAccounts(ids);
        for (const id of ids) this.versions.invalidateAccount(id);
        deleted += ids.length;
        if (ids.length < REVIEWER_CLEANUP_BATCH_SIZE) return deleted;
      }
    } finally {
      this.isRunning = false;
    }
  }
}
