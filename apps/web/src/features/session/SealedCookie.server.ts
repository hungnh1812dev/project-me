import 'server-only';

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { z } from 'zod';

import {
  TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  TWO_FACTOR_COOKIE_NAME,
  TWO_FACTOR_METHODS,
  WEB_SESSION_COOKIE_NAME,
} from '@/configs/Auth.constants';
import { COOKIE_HEADER, SET_COOKIE_HEADER } from '@/configs/Http.constants';
import { getServerEnv } from '@/configs/Server.env';

const SEAL_VERSION = 1;
const SEAL_ALGORITHM = 'aes-256-gcm';
const SEAL_KEY_BYTES = 32;
const SEAL_IV_BYTES = 12;
const SEAL_TAG_BYTES = 16;
const VERSION_BYTES = 1;
/** Names the purpose and the format version, so a new format derives a new key. */
const SEAL_KEY_INFO = `abyss-web-session-cookie-v${SEAL_VERSION}`;
const SEAL_KEY_SALT = '';

const sealedWebSessionShape = z.strictObject({
  refreshToken: z.string().min(1),
  accessToken: z.string().min(1),
  accessExpiresAt: z.number().int().nonnegative(),
});
const sealedTwoFactorChallengeShape = z.strictObject({
  tempToken: z.string().min(1),
  methods: z.array(z.enum(TWO_FACTOR_METHODS)),
});

export type SealedWebSession = z.infer<typeof sealedWebSessionShape>;
export type SealedTwoFactorChallenge = z.infer<typeof sealedTwoFactorChallengeShape>;

/** One derived key per secret; the secret is fixed for the life of the process. */
let derivedKey: { secret: string; key: Buffer } | undefined;

function sealingKey(): Buffer {
  const { sessionSecret } = getServerEnv();
  if (derivedKey?.secret !== sessionSecret) {
    const key = Buffer.from(
      hkdfSync('sha256', sessionSecret, SEAL_KEY_SALT, SEAL_KEY_INFO, SEAL_KEY_BYTES),
    );
    derivedKey = { secret: sessionSecret, key };
  }
  return derivedKey.key;
}

/**
 * AES-256-GCM; the cookie name is the additional data, so a value moved to
 * another cookie does not open. Format: `base64url(version | iv | ciphertext | tag)`.
 */
export function sealCookieValue(name: string, value: unknown): string {
  const iv = randomBytes(SEAL_IV_BYTES);
  const cipher = createCipheriv(SEAL_ALGORITHM, sealingKey(), iv);
  cipher.setAAD(Buffer.from(name));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([SEAL_VERSION]), iv, ciphertext, cipher.getAuthTag()]).toString(
    'base64url',
  );
}

/** The value inside, or null for any failure: wrong key, name, version, tampering or bad JSON. */
export function openCookieValue(name: string, sealed: string): unknown {
  try {
    const bytes = Buffer.from(sealed, 'base64url');
    const ivEnd = VERSION_BYTES + SEAL_IV_BYTES;
    if (bytes.length < ivEnd + SEAL_TAG_BYTES || bytes[0] !== SEAL_VERSION) return null;
    const decipher = createDecipheriv(
      SEAL_ALGORITHM,
      sealingKey(),
      bytes.subarray(VERSION_BYTES, ivEnd),
    );
    decipher.setAAD(Buffer.from(name));
    decipher.setAuthTag(bytes.subarray(bytes.length - SEAL_TAG_BYTES));
    const plain = Buffer.concat([
      decipher.update(bytes.subarray(ivEnd, bytes.length - SEAL_TAG_BYTES)),
      decipher.final(),
    ]);
    return JSON.parse(plain.toString('utf8')) as unknown;
  } catch {
    return null;
  }
}

/** The only place that sets cookie attributes. `maxAgeSeconds` undefined is a browser-session cookie. */
function setCookieLine(name: string, value: string, maxAgeSeconds?: number): string {
  const attributes = ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/'];
  if (maxAgeSeconds !== undefined) attributes.push(`Max-Age=${maxAgeSeconds}`);
  return `${name}=${value}; ${attributes.join('; ')}`;
}

function clearCookieLine(name: string): string {
  return setCookieLine(name, '', 0);
}

function requestCookie(request: Request, name: string): string | undefined {
  for (const pair of (request.headers.get(COOKIE_HEADER) ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function openShaped<T>(
  request: Request,
  name: string,
  shape: z.ZodType<T>,
): { value: T | null; isPresent: boolean } {
  const sealed = requestCookie(request, name);
  if (sealed === undefined) return { value: null, isPresent: false };
  const parsed = shape.safeParse(openCookieValue(name, sealed));
  return { value: parsed.success ? parsed.data : null, isPresent: true };
}

/** `isPresent` with a null `value` is an unreadable cookie: the answer must clear it. */
export function readSessionCookie(request: Request) {
  return openShaped(request, WEB_SESSION_COOKIE_NAME, sealedWebSessionShape);
}

export function readTwoFactorCookie(request: Request) {
  return openShaped(request, TWO_FACTOR_COOKIE_NAME, sealedTwoFactorChallengeShape);
}

export function writeSessionCookie(session: SealedWebSession): string {
  return setCookieLine(WEB_SESSION_COOKIE_NAME, sealCookieValue(WEB_SESSION_COOKIE_NAME, session));
}

export function writeTwoFactorCookie(challenge: SealedTwoFactorChallenge): string {
  return setCookieLine(
    TWO_FACTOR_COOKIE_NAME,
    sealCookieValue(TWO_FACTOR_COOKIE_NAME, challenge),
    TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
  );
}

export const clearSessionCookie = (): string => clearCookieLine(WEB_SESSION_COOKIE_NAME);
export const clearTwoFactorCookie = (): string => clearCookieLine(TWO_FACTOR_COOKIE_NAME);

/** The one place a `Set-Cookie` line joins an answer. */
export function withSetCookies(response: Response, setCookies: readonly string[]): Response {
  for (const cookie of setCookies) response.headers.append(SET_COOKIE_HEADER, cookie);
  return response;
}
