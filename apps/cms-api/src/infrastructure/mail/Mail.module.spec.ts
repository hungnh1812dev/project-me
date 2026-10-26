import { devEnv, productionEnv } from '../../../test/fixtures/Env.fixture';
import { loadAppConfig } from '../../config/AppConfig.setup';
import { ConsoleMailSender } from './ConsoleMail.adapter';
import { MAIL_PROVIDERS } from '../../config/Config.constants';
import { createMailSender, MAIL_SENDER_FACTORIES } from './Mail.module';
import { SmtpMailSender } from './SmtpMail.adapter';

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

  it('has a factory for every MAIL_PROVIDERS entry and no other', () => {
    expect(Object.keys(MAIL_SENDER_FACTORIES).sort()).toEqual(
      [...MAIL_PROVIDERS].sort(),
    );
  });

  it('throws for a provider with no factory, including inherited names', () => {
    const config = loadAppConfig(devEnv());
    for (const provider of ['ses', 'toString']) {
      const unknown = { ...config, mail: { ...config.mail, provider } };
      expect(() => createMailSender(unknown as never)).toThrow(
        /No mail sender/,
      );
    }
  });
});
