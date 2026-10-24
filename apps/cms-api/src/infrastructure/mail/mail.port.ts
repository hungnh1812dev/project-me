/** DI token of the active `MailSender` (chosen by MAIL_PROVIDER). */
export const MAIL_SENDER = Symbol('MAIL_SENDER');

/** A plain-text message. No HTML and no links. */
export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Outgoing mail port. Adapters: console (dev only) and SMTP. */
export interface MailSender {
  send(message: MailMessage): Promise<void>;
}
