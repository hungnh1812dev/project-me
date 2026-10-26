import { bootstrap } from '../../src/Bootstrap.setup';
import { ConfigValidationError } from '../../src/config/AppConfig.setup';
import {
  productionEnv,
  TEST_SECRET_32_BYTES,
  TEST_SHORT_SECRET,
} from '../fixtures/env.fixture';

/** SPEC §12-15: startup fails before Nest is created or a port is bound. */
describe('bootstrap fails fast on invalid production config', () => {
  it.each([
    ['MAIL_PROVIDER=console', { MAIL_PROVIDER: 'console' }],
    ['a missing secret', { JWT_ACCESS_SECRET: undefined }],
    ['a short secret', { TOTP_ENC_KEY: TEST_SHORT_SECRET }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(bootstrap(productionEnv(overrides))).rejects.toBeInstanceOf(
      ConfigValidationError,
    );
  });

  it('never puts secret values in the error', async () => {
    const error: unknown = await bootstrap(
      productionEnv({
        MAIL_PROVIDER: 'console',
        OTP_PEPPER: TEST_SHORT_SECRET,
      }),
    ).catch((e: unknown) => e);
    const message = error instanceof Error ? error.message : '';
    expect(message).not.toContain(TEST_SHORT_SECRET);
    expect(message).not.toContain(TEST_SECRET_32_BYTES);
  });
});
