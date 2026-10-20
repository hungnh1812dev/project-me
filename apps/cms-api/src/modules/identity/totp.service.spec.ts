import { generate } from 'otplib';

import {
  devEnv,
  TEST_SECRET_32_BYTES,
} from '../../../test/fixtures/env.fixture';
import { Clock } from '../../common/clock';
import { MS_PER_SECOND } from '../../common/constants/limits.constants';
import { loadAppConfig } from '../../config/app-config';
import { CONFIG_DEFAULTS } from '../../config/config.constants';
import { type PrismaService } from '../../infrastructure/database/prisma.service';
import { SecretBox } from './crypto/secret-box';
import { TOTP } from './identity.constants';
import { isTotpCodeFormat, TotpService } from './totp.service';

/** Start of a time step, so ±1 step stays inside the test's own math. */
const START_SECONDS = 1_700_000_010;
const STEP = Math.floor(START_SECONDS / TOTP.PERIOD_SECONDS);

class FakeClock extends Clock {
  time = START_SECONDS * MS_PER_SECOND;
  override now(): number {
    return this.time;
  }
}

function codeAt(secret: string, epochSeconds: number): Promise<string> {
  return generate({ secret, epoch: epochSeconds });
}

describe('TotpService (D8, T13 Q3)', () => {
  const config = loadAppConfig(devEnv({ TOTP_ENC_KEY: TEST_SECRET_32_BYTES }));
  let clock: FakeClock;
  let totp: TotpService;
  let secret: string;

  beforeEach(() => {
    clock = new FakeClock();
    // matchStep and otpauthUri never touch the database.
    totp = new TotpService(
      {} as PrismaService,
      new SecretBox(config),
      clock,
      config,
    );
    secret = totp.createSecret();
  });

  it('creates 160-bit base32 secrets', () => {
    // 20 bytes = 32 base32 characters, no padding.
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(totp.createSecret()).not.toBe(secret);
  });

  it('builds an otpauth URI with the issuer and the email label', () => {
    const uri = new URL(totp.otpauthUri('owner@example.test', secret));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe(
      `/${CONFIG_DEFAULTS.TOTP_ISSUER}:owner@example.test`,
    );
    expect(uri.searchParams.get('secret')).toBe(secret);
    expect(uri.searchParams.get('issuer')).toBe(CONFIG_DEFAULTS.TOTP_ISSUER);
  });

  it('accepts the current step and one step of drift either way', async () => {
    for (const offset of [-1, 0, 1]) {
      const code = await codeAt(
        secret,
        START_SECONDS + offset * TOTP.PERIOD_SECONDS,
      );
      expect(await totp.matchStep(secret, code, null)).toBe(STEP + offset);
    }
  });

  it('rejects codes two steps away', async () => {
    for (const offset of [-2, 2]) {
      const code = await codeAt(
        secret,
        START_SECONDS + offset * TOTP.PERIOD_SECONDS,
      );
      expect(await totp.matchStep(secret, code, null)).toBeUndefined();
    }
  });

  it('rejects steps at or below the last used step (replay)', async () => {
    const code = await codeAt(secret, START_SECONDS);
    expect(await totp.matchStep(secret, code, STEP)).toBeUndefined();
    expect(await totp.matchStep(secret, code, STEP + 1)).toBeUndefined();
    expect(await totp.matchStep(secret, code, STEP - 1)).toBe(STEP);
  });

  it.each(['', '12345', '1234567', 'abcdef', ' 123456'])(
    'rejects the malformed code %j without throwing',
    async (code) => {
      expect(isTotpCodeFormat(code)).toBe(false);
      expect(await totp.matchStep(secret, code, null)).toBeUndefined();
    },
  );
});
