import { type DynamicModule, Global, Module, type Type } from '@nestjs/common';

import { RATE_LIMIT_MAX_KEYS } from '../constants/limits.constants';
import { ThrottleGuard } from '../guards/throttle.guard';
import {
  InMemoryRateLimitStore,
  RATE_LIMIT_STORE,
  RATE_LIMIT_STORE_MAX_KEYS,
} from './rate-limit.store';
import {
  THROTTLE_SUBJECT_RESOLVER,
  type ThrottleSubjectResolver,
} from './throttle-subject-resolver';

export interface RateLimitModuleOptions {
  readonly subjectResolver: Type<ThrottleSubjectResolver>;
}

/**
 * Throttling. Global so any feature module can use `@Throttle(...)`.
 * Needs the global `ClockModule` and `ClientIpModule`. Swap `RATE_LIMIT_STORE`
 * for a shared store before running more than one API replica.
 */
@Global()
@Module({})
export class RateLimitModule {
  static forRoot({ subjectResolver }: RateLimitModuleOptions): DynamicModule {
    return {
      module: RateLimitModule,
      providers: [
        { provide: THROTTLE_SUBJECT_RESOLVER, useClass: subjectResolver },
        { provide: RATE_LIMIT_STORE_MAX_KEYS, useValue: RATE_LIMIT_MAX_KEYS },
        InMemoryRateLimitStore,
        { provide: RATE_LIMIT_STORE, useExisting: InMemoryRateLimitStore },
        ThrottleGuard,
      ],
      exports: [RATE_LIMIT_STORE, THROTTLE_SUBJECT_RESOLVER, ThrottleGuard],
    };
  }
}
