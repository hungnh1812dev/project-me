import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { ConsoleMailSender } from './console-mail.sender';
import { MAIL_SENDER, type MailSender } from './mail.port';
import { SmtpMailSender } from './smtp-mail.sender';

type MailProvider = IAppConfig['mail']['provider'];
type MailSenderFactory = (config: IAppConfig) => MailSender;

function createSmtpMailSender(config: IAppConfig): MailSender {
  const { smtp, from } = config.mail;
  // env.schema.ts requires SMTP_HOST and MAIL_FROM for the smtp provider.
  if (smtp === undefined || from === undefined) {
    throw new Error('SMTP mail is not configured');
  }
  return new SmtpMailSender(smtp, from);
}

/** One factory per MAIL_PROVIDERS entry; the type forces a new provider to add one. */
export const MAIL_SENDER_FACTORIES: Record<MailProvider, MailSenderFactory> = {
  console: (config) => new ConsoleMailSender(config),
  smtp: createSmtpMailSender,
};

export function createMailSender(config: IAppConfig): MailSender {
  const { provider } = config.mail;
  if (!Object.hasOwn(MAIL_SENDER_FACTORIES, provider)) {
    throw new Error(`No mail sender for MAIL_PROVIDER=${provider}`);
  }
  return MAIL_SENDER_FACTORIES[provider](config);
}

/** Provides `MAIL_SENDER` for the configured MAIL_PROVIDER. */
@Module({
  providers: [
    {
      provide: MAIL_SENDER,
      inject: [APP_CONFIG],
      useFactory: createMailSender,
    },
  ],
  exports: [MAIL_SENDER],
})
export class MailModule {}
