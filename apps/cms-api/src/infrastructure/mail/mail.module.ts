import { Module } from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import { ConsoleMailSender } from './console-mail.sender';
import { MAIL_SENDER, type MailSender } from './mail.port';
import { SmtpMailSender } from './smtp-mail.sender';

export function createMailSender(config: IAppConfig): MailSender {
  if (config.mail.provider === 'console') return new ConsoleMailSender(config);
  const { smtp, from } = config.mail;
  // env.schema.ts requires SMTP_HOST and MAIL_FROM for the smtp provider.
  if (smtp === undefined || from === undefined) {
    throw new Error('SMTP mail is not configured');
  }
  return new SmtpMailSender(smtp, from);
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
