import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ThrottleGuard } from '../guards/throttle.guard';
import { ClientIpModule } from '../http/client-ip.module';
import { ClockModule } from '../time/clock.module';
import { RateLimitModule } from './rate-limit.module';
import type { ThrottleSubjectResolver } from './throttle-subject-resolver';
import { ConfigModule } from '../../config/config.module';
import { devEnv } from '../../../test/fixtures/env.fixture';
import { loadAppConfig } from '../../config/app-config';

class FakeSubjectResolver implements ThrottleSubjectResolver {
  accountSubjectOf(): string | undefined {
    return undefined;
  }
  isAnonymousRequest(): boolean {
    return false;
  }
}

const config = loadAppConfig(devEnv());

describe('RateLimitModule', () => {
  it('builds the guard when the subject resolver is bound', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(config),
        ClockModule,
        ClientIpModule,
        RateLimitModule.forRoot({ subjectResolver: FakeSubjectResolver }),
      ],
    }).compile();
    expect(moduleRef.get(ThrottleGuard)).toBeInstanceOf(ThrottleGuard);
  });

  it('fails to boot when the subject resolver binding is missing', async () => {
    @Module({
      imports: [
        ConfigModule.forRoot(config),
        ClockModule,
        ClientIpModule,
        RateLimitModule.forRoot({
          subjectResolver: undefined as unknown as never,
        }),
      ],
    })
    class MissingBindingModule {}
    await expect(
      Test.createTestingModule({ imports: [MissingBindingModule] }).compile(),
    ).rejects.toThrow(/THROTTLE_SUBJECT_RESOLVER|useClass|undefined/);
  });
});
