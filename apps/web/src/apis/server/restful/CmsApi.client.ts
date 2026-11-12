import 'server-only';

import { z } from 'zod';

import {
  API_ERROR_SOURCES,
  API_ERROR_CODES as WEB_API_ERROR_CODES,
  WebApiError,
  type ApiErrorCode,
} from '@/apis/WebApi.errors';
import { API_ENDPOINTS } from '@/configs/Api.endpoints';
import {
  API_ERROR_CODES,
  BEARER_PREFIX,
  CMS_API_REFRESH_COOKIE_NAME,
} from '@/configs/Auth.constants';
import {
  ACCEPT_HEADER,
  AUTHORIZATION_HEADER,
  CONTENT_TYPE_HEADER,
  COOKIE_HEADER,
  FORWARDED_FOR_HEADER,
  HEALTH_STATUS_OK,
  HTTP_STATUS,
  JSON_MEDIA_TYPE,
  ORIGIN_HEADER,
  RETRY_AFTER_HEADER,
  SECONDS_PER_MINUTE,
} from '@/configs/Http.constants';
import { getServerEnv } from '@/configs/Server.env';

import { BffError } from '../bff/Bff.errors';
import { serverApi, type ServerApiAnswer } from './ServerApi.client';

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

function requestHeaders(options: CallOptions): Record<string, string> {
  const { webOrigin, clientIpHeader } = getServerEnv();
  const headers: Record<string, string> = { [ACCEPT_HEADER]: JSON_MEDIA_TYPE };
  if (options.body !== undefined) headers[CONTENT_TYPE_HEADER] = JSON_MEDIA_TYPE;
  if (options.visitorIp !== undefined) {
    headers[FORWARDED_FOR_HEADER] = options.visitorIp;
    if (clientIpHeader !== undefined) headers[clientIpHeader] = options.visitorIp;
  }
  if (options.accessToken !== undefined) {
    headers[AUTHORIZATION_HEADER] = `${BEARER_PREFIX}${options.accessToken}`;
  }
  if (options.refreshToken !== undefined) {
    headers[COOKIE_HEADER] = `${CMS_API_REFRESH_COOKIE_NAME}=${options.refreshToken}`;
    headers[ORIGIN_HEADER] = webOrigin;
  }
  return headers;
}

/**
 * axios silently strips CR and LF from a header value, so a malformed token
 * would reach cms-api altered. `Headers` throws on it, as `fetch` did.
 */
function validatedHeadersOf(options: CallOptions): Record<string, string> {
  return Object.fromEntries(new Headers(requestHeaders(options)));
}

/** An answer or transport failure of cms-api; the BFF route turns it into its fixed answer. */
function upstreamFailure(
  errorCode: ApiErrorCode,
  options: {
    statusCode?: number;
    upstreamErrorCode?: string | undefined;
    retryAfterSeconds?: number;
  } = {},
): WebApiError {
  return new WebApiError({ source: API_ERROR_SOURCES.CMS_API_REST, errorCode, ...options });
}

function retryAfterSecondsOf(response: ServerApiAnswer): number {
  const seconds = Number(response.headers.get(RETRY_AFTER_HEADER));
  return Number.isInteger(seconds) && seconds > 0 ? seconds : SECONDS_PER_MINUTE;
}

/**
 * One cms-api call. Refuses, with the fixed BFF codes, what no route handles
 * itself: no answer, a timeout, a redirect, a 429 and a 5xx. The 2xx and the
 * other 4xx come back for the calling method to judge.
 */
async function callCmsApi(options: CallOptions): Promise<ServerApiAnswer> {
  let response: ServerApiAnswer;
  try {
    // Inside the try: a token that is not a valid header value throws here.
    const send = options.method === 'GET' ? serverApi.get : serverApi.post;
    response = await send(options.path, {
      headers: validatedHeadersOf(options),
      ...(options.body === undefined ? {} : { body: options.body }),
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof WebApiError) throw error;
    throw upstreamFailure(WEB_API_ERROR_CODES.BFF.UPSTREAM_FAILED);
  }
  if (response.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
    throw upstreamFailure(WEB_API_ERROR_CODES.BFF.RATE_LIMITED, {
      statusCode: response.status,
      retryAfterSeconds: retryAfterSecondsOf(response),
    });
  }
  if (response.status >= HTTP_STATUS.SERVER_ERROR_MIN) throw unexpectedStatus(response);
  return response;
}

function parseAnswer<T>(response: ServerApiAnswer, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(response.body);
  if (!parsed.success) {
    throw upstreamFailure(WEB_API_ERROR_CODES.SERVER_API.INVALID_BODY, {
      statusCode: response.status,
    });
  }
  return parsed.data;
}

function errorCodeOf(response: ServerApiAnswer): string | undefined {
  const parsed = errorAnswer.safeParse(response.body);
  return parsed.success ? parsed.data.errorCode : undefined;
}

/** The refresh token among the `Set-Cookie` lines, by name only; an emptied cookie is none. */
function refreshTokenOf(response: ServerApiAnswer): string | undefined {
  const prefix = `${CMS_API_REFRESH_COOKIE_NAME}=`;
  const line = response.headers.getSetCookie().find((cookie) => cookie.startsWith(prefix));
  const value = line?.slice(prefix.length).split(';')[0]?.trim();
  return value === undefined || value === '' ? undefined : value;
}

function unexpectedStatus(response: ServerApiAnswer): WebApiError {
  return upstreamFailure(WEB_API_ERROR_CODES.BFF.UPSTREAM_FAILED, {
    statusCode: response.status,
    ...(errorCodeOf(response) !== undefined && { upstreamErrorCode: errorCodeOf(response) }),
  });
}

function expectStatus(response: ServerApiAnswer, status: number): void {
  if (response.status !== status) throw unexpectedStatus(response);
}

/** A second-step 401 maps by cms-api's code; any other refusal is an upstream failure. */
function throwTwoFactorRefusal(response: ServerApiAnswer): never {
  if (response.status === HTTP_STATUS.UNAUTHORIZED) {
    const errorCode = errorCodeOf(response);
    if (errorCode === API_ERROR_CODES.INVALID_2FA_CODE) {
      throw new BffError('BFF_INVALID_TWO_FACTOR_CODE', {}, [], { upstreamErrorCode: errorCode });
    }
    if (errorCode === API_ERROR_CODES.INVALID_TEMP_TOKEN) {
      throw new BffError('BFF_TWO_FACTOR_EXPIRED', {}, [], { upstreamErrorCode: errorCode });
    }
  }
  throw unexpectedStatus(response);
}

/**
 * The fixed list of cms-api calls the BFF makes (ADR 0018 section 2). Every
 * call forwards the visitor IP; a failure is a `WebApiError`; the BFF route maps it to a fixed code.
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
    if (response.status === HTTP_STATUS.UNAUTHORIZED) {
      throw new BffError('BFF_INVALID_CREDENTIALS', {}, [], {
        upstreamErrorCode: errorCodeOf(response),
      });
    }
    expectStatus(response, HTTP_STATUS.OK);
    const refreshToken = refreshTokenOf(response);
    const answer = parseAnswer(response, z.union([accessTokenAnswer, twoFactorRequiredAnswer]));
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
    const { accessToken } = parseAnswer(response, accessTokenAnswer);
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
    const { accessToken } = parseAnswer(response, accessTokenAnswer);
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
      return parseAnswer(response, healthAnswer).status === HEALTH_STATUS_OK;
    } catch {
      return false;
    }
  },
};
