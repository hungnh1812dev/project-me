import type { IAppConfig } from './app-config';
import { REDACTED } from './config.constants';

const UNSET = 'unset';

/** Secrets show only whether they are set, never their value. */
function secretState(value: string | undefined): string {
  return value === undefined ? UNSET : REDACTED;
}

/**
 * Loggable view of the config (D17). Every field is listed here by hand: a
 * new config field stays out of the log until someone adds it on purpose.
 */
export function summarizeConfig(config: IAppConfig): Record<string, unknown> {
  const { smtp } = config.mail;
  const { cloudinary } = config.media;

  return {
    env: config.env,
    http: {
      port: config.http.port,
      trustProxyHops: config.http.trustProxyHops,
      clientIpHeader: config.http.clientIpHeader,
    },
    cors: { allowedOrigins: config.cors.allowedOrigins },
    auth: {
      cookieOrigins: config.auth.cookieOrigins,
      jwtAccessKid: config.auth.jwtAccessKid,
      totp: {
        encKid: config.auth.totp.encKid,
        previousEncKid: config.auth.totp.previousEncKid,
        issuer: config.auth.totp.issuer,
      },
    },
    database: {
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: REDACTED,
    },
    rateLimit: { limitOverrides: config.rateLimit.limitOverrides },
    mail: {
      provider: config.mail.provider,
      from: config.mail.from,
      smtp:
        smtp === undefined
          ? undefined
          : {
              host: smtp.host,
              port: smtp.port,
              secure: smtp.secure,
              user: smtp.auth?.user,
              password: secretState(smtp.auth?.password),
            },
    },
    media: {
      provider: config.media.provider,
      cloudinary:
        cloudinary === undefined
          ? undefined
          : {
              cloudName: cloudinary.cloudName,
              apiKey: secretState(cloudinary.apiKey),
              apiSecret: secretState(cloudinary.apiSecret),
              folder: cloudinary.folder,
            },
    },
    reviewer: {
      turnstileExpectedHostname: config.reviewer.turnstileExpectedHostname,
    },
    secrets: {
      jwtAccessSecret: secretState(config.secrets.jwtAccessSecret),
      otpPepper: secretState(config.secrets.otpPepper),
      totpEncKey: secretState(config.secrets.totpEncKey),
      totpEncPreviousKey: secretState(config.secrets.totpEncPreviousKey),
      turnstileSecretKey: secretState(config.secrets.turnstileSecretKey),
      ownerSetupToken: secretState(config.secrets.ownerSetupToken),
    },
  };
}
