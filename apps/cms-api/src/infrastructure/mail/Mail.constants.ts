/**
 * SMTP socket timeouts. nodemailer's defaults (2 min connect, 10 min idle)
 * would keep a stuck send alive long after the request that queued it.
 */
export const SMTP_TIMEOUTS_MS = {
  CONNECTION: 10_000,
  GREETING: 10_000,
  SOCKET: 30_000,
} as const;

export const CONSOLE_MAIL_LOGGER_CONTEXT = 'ConsoleMail';
export const SMTP_MAIL_LOGGER_CONTEXT = 'SmtpMail';
