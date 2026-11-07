import 'server-only';

import { z } from 'zod';

import { API_ENDPOINTS } from '@/configs/Api.endpoints';
import {
  API_ERROR_CODES,
  BEARER_PREFIX,
  CMS_API_REFRESH_COOKIE_NAME,
} from '@/configs/Auth.constants';
import {
  ACCEPT_HEADER,
  API_TIMEOUT_MS,
  AUTHORIZATION_HEADER,
  CONTENT_TYPE_HEADER,
  COOKIE_HEADER,
  FORWARDED_FOR_HEADER,
  HEALTH_STATUS_OK,
  HTTP_STATUS,
  JSON_MEDIA_TYPE,
  ORIGIN_HEADER,
  REDIRECT_STATUS_MIN,
  RETRY_AFTER_HEADER,
  SECONDS_PER_MINUTE,
} from '@/configs/Http.constants';
import { getServerEnv } from '@/configs/Server.env';

import { BffError } from '../bff/Bff.errors';

const accessTokenAnswer = z.object({ accessToken: z.string().min(1) });
const twoFactorRequiredAnswer = z.object({
  requires2FA: z.literal(true),
  tempToken: z.string().min(1),
  methods: z.array(z.string()),
});
const currentAccountAnswer = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: z.string(),
  permissions: z.array(z.string()),
});
const healthAnswer = z.object({ status: z.string() });
const errorAnswer = z.object({ errorCode: z.string() });

/** Only these fields leave the client; everything else cms-api sends is dropped. */
export type CurrentAccount = z.infer<typeof currentAccountAnswer>;

export interface IssuedTokens {
  accessToken: string;
  /** From `Set-Cookie`; undefined when cms-api kept the stored one (refresh grace). */
  refreshToken: string | undefined;
}

export type LogInResult =
  | ({ kind: 'signed-in' } & IssuedTokens)
  | { kind: 'two-factor-required'; tempToken: string; methods: string[] };

/** The visitor address forwarded to cms-api; undefined when none could be trusted. */
type VisitorIp = string | undefined;

interface CallOptions {
  method: 'GET' | 'POST';
  path: string;
  visitorIp: VisitorIp;
  accessToken?: string;
  refreshToken?: string;
  body?: unknown;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function requestHeaders(options: CallOptions): Headers {
  const { webOrigin, clientIpHeader } = getServerEnv();
  const headers = new Headers({ [ACCEPT_HEADER]: JSON_MEDIA_TYPE });
  if (options.body !== undefined) headers.set(CONTENT_TYPE_HEADER, JSON_MEDIA_TYPE);
  if (options.visitorIp !== undefined) {
    headers.set(FORWARDED_FOR_HEADER, options.visitorIp);
    if (clientIpHeader !== undefined) headers.set(clientIpHeader, options.visitorIp);
  }
  if (options.accessToken !== undefined) {
    headers.set(AUTHORIZATION_HEADER, `${BEARER_PREFIX}${options.accessToken}`);
  }
  if (options.refreshToken !== undefined) {
    headers.set(COOKIE_HEADER, `${CMS_API_REFRESH_COOKIE_NAME}=${options.refreshToken}`);
    headers.set(ORIGIN_HEADER, webOrigin);
  }
  return headers;
}

function retryAfterSecondsOf(response: Response): number {
  const seconds = Number(response.headers.get(RETRY_AFTER_HEADER));
  return Number.isInteger(seconds) && seconds > 0 ? seconds : SECONDS_PER_MINUTE;
}

/**
 * One cms-api call. Refuses, with the fixed BFF codes, what no route handles
 * itself: no answer, a timeout, a redirect, a 429 and a 5xx. The 2xx and the
 * other 4xx come back for the calling method to judge.
 */
async function callCmsApi(options: CallOptions): Promise<Response> {
  let response: Response;
  try {
    // Inside the try: a token that is not a valid header value throws here.
    response = await fetch(`${getServerEnv().apiInternalUrl}${options.path}`, {
      method: options.method,
      headers: requestHeaders(options),
      body: options.body === undefined ? null : JSON.stringify(options.body),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
  } catch (error) {
    throw new BffError(isTimeout(error) ? 'BFF_UPSTREAM_TIMEOUT' : 'BFF_UPSTREAM_FAILED');
  }
  if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    throw BffError.rateLimited(retryAfterSecondsOf(response));
  }
  const isRedirect =
    response.status >= REDIRECT_STATUS_MIN && response.status < HTTP_STATUS.BAD_REQUEST;
  if (isRedirect || response.status >= HTTP_STATUS.SERVER_ERROR_MIN) {
    throw new BffError('BFF_UPSTREAM_FAILED');
  }
  return response;
}

async function parseAnswer<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new BffError('BFF_UPSTREAM_FAILED');
  return parsed.data;
}

async function errorCodeOf(response: Response): Promise<string | undefined> {
  const parsed = errorAnswer.safeParse(await response.json().catch(() => undefined));
  return parsed.success ? parsed.data.errorCode : undefined;
}

/** The refresh token among the `Set-Cookie` lines, by name only; an emptied cookie is none. */
function refreshTokenOf(response: Response): string | undefined {
  const prefix = `${CMS_API_REFRESH_COOKIE_NAME}=`;
  const line = response.headers.getSetCookie().find((cookie) => cookie.startsWith(prefix));
  const value = line?.slice(prefix.length).split(';')[0]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function expectStatus(response: Response, status: number): void {
  if (response.status !== status) throw new BffError('BFF_UPSTREAM_FAILED');
}

/** A second-step 401 maps by cms-api's code; any other refusal is an upstream failure. */
async function throwTwoFactorRefusal(response: Response): Promise<never> {
  if (response.status === HTTP_STATUS.UNAUTHORIZED) {
    const errorCode = await errorCodeOf(response);
    if (errorCode === API_ERROR_CODES.INVALID_2FA_CODE) {
      throw new BffError('BFF_INVALID_TWO_FACTOR_CODE');
    }
    if (errorCode === API_ERROR_CODES.INVALID_TEMP_TOKEN) {
      throw new BffError('BFF_TWO_FACTOR_EXPIRED');
    }
  }
  throw new BffError('BFF_UPSTREAM_FAILED');
}

/**
 * The fixed list of cms-api calls the BFF makes (ADR 0018 section 2). Every
 * call forwards the visitor IP; a failure is a `BffError` with a fixed code.
 */
export const cmsApiClient = {
  /** Any 401 is `BFF_INVALID_CREDENTIALS`: no account enumeration. */
  async logIn(
    credentials: { email: string; password: string; rememberMe: boolean },
    visitorIp: VisitorIp,
  ): Promise<LogInResult> {
    const response = await callCmsApi({
      method: 'POST',
      path: API_ENDPOINTS.AUTH.LOGIN,
      visitorIp,
      body: credentials,
    });
    if (response.status === HTTP_STATUS.UNAUTHORIZED) throw new BffError('BFF_INVALID_CREDENTIALS');
    expectStatus(response, HTTP_STATUS.OK);
    const refreshToken = refreshTokenOf(response);
    const answer = await parseAnswer(
      response,
      z.union([accessTokenAnswer, twoFactorRequiredAnswer]),
    );
    if ('requires2FA' in answer) {
      return { kind: 'two-factor-required', tempToken: answer.tempToken, methods: answer.methods };
    }
    return { kind: 'signed-in', accessToken: answer.accessToken, refreshToken };
  },

  async verifyTwoFactor(
    input: { tempToken: string; code: string },
    visitorIp: VisitorIp,
  ): Promise<IssuedTokens> {
    const response = await callCmsApi({
      method: 'POST',
      path: API_ENDPOINTS.TWO_FACTOR.VERIFY,
      visitorIp,
      body: input,
    });
    if (response.status !== HTTP_STATUS.OK) return throwTwoFactorRefusal(response);
    const { accessToken } = await parseAnswer(response, accessTokenAnswer);
    return { accessToken, refreshToken: refreshTokenOf(response) };
  },

  async sendEmailChallenge(tempToken: string, visitorIp: VisitorIp): Promise<void> {
    const response = await callCmsApi({
      method: 'POST',
      path: API_ENDPOINTS.TWO_FACTOR.EMAIL_CHALLENGE,
      visitorIp,
      body: { tempToken },
    });
    if (response.status !== HTTP_STATUS.ACCEPTED) return throwTwoFactorRefusal(response);
  },

  /** Null when cms-api refuses the refresh token: the session is over, not broken. */
  async refreshSession(refreshToken: string, visitorIp: VisitorIp): Promise<IssuedTokens | null> {
    const response = await callCmsApi({
      method: 'POST',
      path: API_ENDPOINTS.AUTH.REFRESH,
      visitorIp,
      refreshToken,
    });
    if (response.status === HTTP_STATUS.UNAUTHORIZED) return null;
    expectStatus(response, HTTP_STATUS.OK);
    const { accessToken } = await parseAnswer(response, accessTokenAnswer);
    return { accessToken, refreshToken: refreshTokenOf(response) };
  },

  async logOut(refreshToken: string, visitorIp: VisitorIp): Promise<void> {
    const response = await callCmsApi({
      method: 'POST',
      path: API_ENDPOINTS.AUTH.LOGOUT,
      visitorIp,
      refreshToken,
    });
    expectStatus(response, HTTP_STATUS.NO_CONTENT);
  },

  /** Null when cms-api refuses the access token. */
  async readCurrentAccount(
    accessToken: string,
    visitorIp: VisitorIp,
  ): Promise<CurrentAccount | null> {
    const response = await callCmsApi({
      method: 'GET',
      path: API_ENDPOINTS.AUTH.ME,
      visitorIp,
      accessToken,
    });
    if (response.status === HTTP_STATUS.UNAUTHORIZED) return null;
    expectStatus(response, HTTP_STATUS.OK);
    return parseAnswer(response, currentAccountAnswer);
  },

  /** False for anything but an `ok` answer: down, slow, redirected or unreadable. */
  async readLiveHealth(): Promise<boolean> {
    try {
      const response = await callCmsApi({
        method: 'GET',
        path: API_ENDPOINTS.HEALTH.LIVE,
        visitorIp: undefined,
      });
      if (response.status !== HTTP_STATUS.OK) return false;
      return (await parseAnswer(response, healthAnswer)).status === HEALTH_STATUS_OK;
    } catch {
      return false;
    }
  },
};
