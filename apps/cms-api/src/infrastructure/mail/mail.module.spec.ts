import { devEnv, productionEnv } from '../../../test/fixtures/env.fixture';
import { loadAppConfig } from '../../config/app-config';
import { ConsoleMailSender } from './console-mail.sender';
import { createMailSender } from './mail.module';
import { SmtpMailSender } from './smtp-mail.sender';

describe('createMailSender', () => {
  it('uses the console adapter for MAIL_PROVIDER=console', () => {
    expect(createMailSender(loadAppConfig(devEnv()))).toBeInstanceOf(
      ConsoleMailSender,
    );
  });

  it('uses the SMTP adapter for MAIL_PROVIDER=smtp', () => {
    expect(createMailSender(loadAppConfig(productionEnv()))).toBeInstanceOf(
      SmtpMailSender,
    );
  });

  it('refuses the console adapter in production', () => {
    const config = { ...loadAppConfig(productionEnv()), isProduction: true };
    expect(() => new ConsoleMailSender(config)).toThrow(/production/);
  });
});
