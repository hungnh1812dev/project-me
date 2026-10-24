import { type OtpPurpose } from '../../generated/prisma/client';
import { type MailMessage } from '../../infrastructure/mail/mail.port';
import { SECONDS_PER_MINUTE } from '../../common/constants/time.constants';
import { ADMIN_PAGE_PATHS, OTP } from './identity.constants';

const PRODUCT_NAME = 'Abyss CMS';

interface OtpMailCopy {
  readonly subject: string;
  readonly intro: string;
  /** Admin page where the code is entered; undefined = the current screen. */
  readonly pagePath: string | undefined;
}

/** English copy per purpose (plain text, the code only, no links). */
const OTP_MAIL_COPY: Readonly<Record<OtpPurpose, OtpMailCopy>> = {
  INVITE_SET_PASSWORD: {
    subject: `Your ${PRODUCT_NAME} invitation code`,
    intro: `You have been invited to ${PRODUCT_NAME}. Use this code to set your password:`,
    pagePath: ADMIN_PAGE_PATHS.SET_PASSWORD,
  },
  RESET_PASSWORD: {
    subject: `Your ${PRODUCT_NAME} password reset code`,
    intro: 'Use this code to reset your password:',
    pagePath: ADMIN_PAGE_PATHS.RESET_PASSWORD,
  },
  /** Sign-in and turning email 2FA on/off share this purpose. */
  LOGIN_2FA_EMAIL: {
    subject: `Your ${PRODUCT_NAME} verification code`,
    intro: 'Use this code to confirm it is you:',
    pagePath: undefined,
  },
};

/**
 * Builds the plain-text OTP email. The admin URL is written out as text
 * (not a link) so the reader can check where they type the code.
 */
export function buildOtpMail(
  to: string,
  purpose: OtpPurpose,
  code: string,
  adminOrigin: string | undefined,
): MailMessage {
  const copy = OTP_MAIL_COPY[purpose];
  const minutes = OTP.TTL_SECONDS / SECONDS_PER_MINUTE;
  const lines = [
    copy.intro,
    '',
    code,
    '',
    `The code expires in ${minutes} minutes and works once.`,
  ];
  if (copy.pagePath !== undefined && adminOrigin !== undefined) {
    lines.push(`Enter it at ${adminOrigin}${copy.pagePath}`);
  }
  lines.push(
    '',
    'If you did not ask for this code, you can ignore this email. Never share the code with anyone.',
  );
  return { to, subject: copy.subject, text: lines.join('\n') };
}
