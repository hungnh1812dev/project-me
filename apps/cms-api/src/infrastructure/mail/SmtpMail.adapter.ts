import { createTransport, type Transporter } from 'nodemailer';

import { type SmtpConfig } from '../../config/AppConfig.setup';
import { SMTP_TIMEOUTS_MS } from './Mail.constants';
import { type MailMessage, type MailSender } from './Mail.port';

/**
 * Generic SMTP adapter (nodemailer). Works with any submission server, e.g.
 * Gmail as smtp.gmail.com:587 with an App Password, or Mailpit in the smoke
 * stack. `secure: false` still upgrades with STARTTLS when the server offers it.
 */
export class SmtpMailSender implements MailSender {
  private readonly transport: Transporter;

  constructor(
    smtp: SmtpConfig,
    private readonly from: string,
  ) {
    this.transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth:
        smtp.auth === undefined
          ? undefined
          : { user: smtp.auth.user, pass: smtp.auth.password },
      connectionTimeout: SMTP_TIMEOUTS_MS.CONNECTION,
      greetingTimeout: SMTP_TIMEOUTS_MS.GREETING,
      socketTimeout: SMTP_TIMEOUTS_MS.SOCKET,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
