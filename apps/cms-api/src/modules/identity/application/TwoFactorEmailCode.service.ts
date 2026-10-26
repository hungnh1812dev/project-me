import { Inject, Injectable } from '@nestjs/common';

import type { ClientMeta } from '../../../common/types/ClientMeta.entity';
import { type IAppConfig } from '../../../config/app-config';
import { APP_CONFIG } from '../../../config/config.constants';
import {
  APP_LOGGER,
  type AppLogger,
} from '../../../infrastructure/logging/AppLogger.port';
import {
  MAIL_SENDER,
  type MailSender,
} from '../../../infrastructure/mail/mail.port';
import { EMAIL_CODE_PURPOSE } from '../domain/Identity.constants';
import { mailNotDelivered } from '../domain/Identity.errors';
import { buildOtpMail, OtpService } from './Otp.service';

const LOGGER_CONTEXT = 'TwoFactorEmailCodeService';

/** Issues a LOGIN_2FA_EMAIL code and mails it; shared by login and management. */
@Injectable()
export class TwoFactorEmailCodeService {
  constructor(
    private readonly otp: OtpService,
    @Inject(MAIL_SENDER) private readonly mail: MailSender,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
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
        LOGGER_CONTEXT,
      );
      throw mailNotDelivered();
    }
  }
}
