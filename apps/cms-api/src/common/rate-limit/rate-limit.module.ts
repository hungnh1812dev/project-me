import { Global, Module } from '@nestjs/common';

import { ClientIpResolver } from '../client-ip.resolver';
import { Clock } from '../clock';
import { RATE_LIMIT_MAX_KEYS } from '../constants/limits.constants';
import { ThrottleGuard } from '../guards/throttle.guard';
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
  RATE_LIMIT_STORE_MAX_KEYS,
} from './rate-limit.store';

/**
 * Client IP resolution and throttling (T10). Global so any feature module can
 * use `@Throttle(...)` and `ClientIpResolver`. Swap `RATE_LIMIT_STORE` for a
 * shared store before running more than one API replica.
 */
@Global()
@Module({
  providers: [
    Clock,
    ClientIpResolver,
    { provide: RATE_LIMIT_STORE_MAX_KEYS, useValue: RATE_LIMIT_MAX_KEYS },
    InMemoryRateLimitStore,
    { provide: RATE_LIMIT_STORE, useExisting: InMemoryRateLimitStore },
    ThrottleGuard,
  ],
  exports: [Clock, ClientIpResolver, RATE_LIMIT_STORE, ThrottleGuard],
})
export class RateLimitModule {}
