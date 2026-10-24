import { ServiceUnavailableException } from '@nestjs/common';

import type { Clock } from '../../common/time/clock';
import type { IAppConfig } from '../../config/app-config';
import type { PrismaService } from '../../infrastructure/database/prisma.service';
import { UnconfiguredTurnstileVerifier } from '../../infrastructure/turnstile/turnstile.client';
import type { AccessTokenService } from '../identity';
import type { SecurityAuditService } from '../security-audit';
import type { VersionCache } from '../access';
import { ReviewerService } from './reviewer.service';

const SESSION_REQUEST = {
  visitorRole: 'Recruiter',
  purposeTags: ['hiring'],
  notes: 'hello',
  turnstileToken: 'token',
};

describe('ReviewerService.createSession with no Turnstile secret', () => {
  it('answers 503 and never calls verify or touches the database', async () => {
    const turnstile = new UnconfiguredTurnstileVerifier();
    const verify = jest.spyOn(turnstile, 'verify');
    const prisma = {} as PrismaService;
    const service = new ReviewerService(
      prisma,
      {} as Clock,
      {} as VersionCache,
      {} as SecurityAuditService,
      {} as AccessTokenService,
      turnstile,
      { secrets: { otpPepper: 'p'.repeat(32) } } as IAppConfig,
    );

    await expect(
      service.createSession(SESSION_REQUEST, '203.0.113.9', 'agent'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(verify).not.toHaveBeenCalled();
  });
});
