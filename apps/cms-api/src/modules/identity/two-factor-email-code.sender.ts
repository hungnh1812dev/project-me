import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  MAIL_SENDER,
  type MailSender,
} from '../../infrastructure/mail/mail.port';
import { type ClientMeta } from '../../common/http/client-meta';
import { buildOtpMail } from './otp-mail';
import { OtpService } from './otp.service';
import { EMAIL_CODE_PURPOSE } from './two-factor.shared';

/** Issues a LOGIN_2FA_EMAIL code and mails it; shared by login and management. */
@Injectable()
export class TwoFactorEmailCodeSender {
  private readonly logger = new Logger(TwoFactorEmailCodeSender.name);

  constructor(
    private readonly otp: OtpService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
  ) {}

  /** 429 past the hourly cap; 503 when the mail is not delivered. */
  async send(
    accountId: number,
    email: string,
    meta: ClientMeta,
  ): Promise<void> {
    const code = await this.otp.issue(accountId, EMAIL_CODE_PURPOSE, {
      ip: meta.ip,
    });
    try {
      await this.mail.send(
        buildOtpMail(
          email,
          EMAIL_CODE_PURPOSE,
          code,
          this.config.cors.allowedOrigins[0],
        ),
      );
    } catch (error) {
      // Name and code only: SMTP error messages can echo the recipient.
      const name = error instanceof Error ? error.name : typeof error;
      const errorCode = (error as { code?: unknown } | null)?.code;
      this.logger.warn(
        `2FA code not delivered: ${name}${typeof errorCode === 'string' ? ` (${errorCode})` : ''}`,
      );
      throw new ServiceUnavailableException();
    }
  }
}
