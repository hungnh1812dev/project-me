import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ThrottleGuard } from '../guards/Throttle.guard';
import { ClientIpModule } from '../http/ClientIp.module';
import { ClockModule } from '../time/Clock.module';
import { RateLimitModule } from './RateLimit.module';
import type { ThrottleSubjectResolver } from './ThrottleSubject.port';
import { ConfigModule } from '../../config/Config.module';
import { devEnv } from '../../../test/fixtures/env.fixture';
import { loadAppConfig } from '../../config/AppConfig.setup';

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
