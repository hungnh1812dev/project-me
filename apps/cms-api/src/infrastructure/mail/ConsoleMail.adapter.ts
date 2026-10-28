import { Logger } from '@nestjs/common';

import { type IAppConfig } from '../../config/AppConfig.setup';
import { CONSOLE_MAIL_LOGGER_CONTEXT } from './Mail.constants';
import { type MailMessage, type MailSender } from './Mail.port';

/**
 * Development adapter: writes the whole message (OTP codes included) to the
 * log. Refuses to exist in production, on top of the env schema rejecting
 * MAIL_PROVIDER=console there (D17), because it would log secrets.
 */
export class ConsoleMailSender implements MailSender {
  private readonly logger = new Logger(CONSOLE_MAIL_LOGGER_CONTEXT);

  constructor(config: IAppConfig) {
    if (config.isProduction) {
      throw new Error('The console mail adapter is not allowed in production');
    }
  }

  send(message: MailMessage): Promise<void> {
    this.logger.log(
      `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`,
    );
    return Promise.resolve();
  }
}
