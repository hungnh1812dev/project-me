import 'server-only';

import { TURNSTILE_TOKEN_FIELD, TURNSTILE_TOKEN_MAX_LENGTH } from '@abyss/form-commons/human-check';
import { z } from 'zod';

import { BffError } from '@/apis/server/bff/Bff.errors';
import { BffContext } from '@/apis/server/bff/BffRoute.server';
import { cmsApiClient, IssuedTokens } from '@/apis/server/restful/CmsApi.client';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  TWO_FACTOR_CODE_MAX_LENGTH,
  TWO_FACTOR_METHODS,
} from '@/configs/Auth.constants';
import { HTTP_STATUS } from '@/configs/Http.constants';

import {
  clearSessionCookie,
  clearTwoFactorCookie,
  readSessionCookie,
  readTwoFactorCookie,
  withSetCookies,
  writeSessionCookie,
  writeTwoFactorCookie,
} from './SealedCookie.server';
import { accessExpiryOf, isPrivilegedAccount, publicUserOf } from './WebSession.server';

const turnstileToken = z.string().min(1).max(TURNSTILE_TOKEN_MAX_LENGTH);

export const loginBodySchema = z.object({
  email: z.string().min(1).max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  rememberMe: z.boolean().default(false),
  [TURNSTILE_TOKEN_FIELD]: turnstileToken,
});
export const emailCodeBodySchema = z.object({ [TURNSTILE_TOKEN_FIELD]: turnstileToken });
export const verifyBodySchema = z.object({
  code: z.string().min(1).max(TWO_FACTOR_CODE_MAX_LENGTH),
  [TURNSTILE_TOKEN_FIELD]: turnstileToken,
});

/** Only the methods the sign-in dialog knows leave the server. */
function knownMethodsOf(methods: string[]) {
  return TWO_FACTOR_METHODS.filter((method) => methods.includes(method));
}

/** No readable challenge cookie: the step expired, and an unreadable cookie is cleared. */
function requireTwoFactorChallenge(request: Request) {
  const challenge = readTwoFactorCookie(request);
  if (challenge.value === null) {
    throw new BffError(
      'BFF_TWO_FACTOR_EXPIRED',
      {},
      challenge.isPresent ? [clearTwoFactorCookie()] : [],
    );
  }
  return challenge.value;
}

async function withExpiredChallengeCleared<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof BffError && error.errorCode === 'BFF_TWO_FACTOR_EXPIRED') {
      throw new BffError(error.errorCode, error.headers, [clearTwoFactorCookie()]);
    }
    throw error;
  }
}

/** The session cookie for the tokens cms-api issued, unless the account is privileged (logged out again, cookies cleared). */
async function sealSession(
  issued: IssuedTokens,
  rememberMe: boolean,
  visitorIp: string | undefined,
) {
  const accessExpiresAt = accessExpiryOf(issued.accessToken);
  if (issued.refreshToken === undefined || accessExpiresAt === null) {
    throw new BffError('BFF_UPSTREAM_FAILED');
  }
  const account = await cmsApiClient.readCurrentAccount(issued.accessToken, visitorIp);
  if (account === null) throw new BffError('BFF_UPSTREAM_FAILED');
  if (isPrivilegedAccount(account)) {
    await cmsApiClient.logOut(issued.refreshToken, visitorIp).catch(() => undefined);
    throw new BffError('BFF_PRIVILEGED_ACCOUNT', {}, [
      clearSessionCookie(),
      clearTwoFactorCookie(),
    ]);
  }
  const session = {
    refreshToken: issued.refreshToken,
    accessToken: issued.accessToken,
    accessExpiresAt,
    rememberMe,
  };
  return {
    user: publicUserOf(account),
    setCookies: [writeSessionCookie(session), clearTwoFactorCookie()],
  };
}

export async function logInVisitor({
  body,
  visitorIp,
}: BffContext<z.output<typeof loginBodySchema>>): Promise<Response> {
  const result = await cmsApiClient.logIn(
    {
      email: body.email,
      password: body.password,
      rememberMe: body.rememberMe,
      turnstileToken: body.turnstileToken,
    },
    visitorIp,
  );
  if (result.kind === 'signed-in') {
    const { user, setCookies } = await sealSession(result, body.rememberMe, visitorIp);
    return withSetCookies(Response.json({ status: 'signed-in', user }), setCookies);
  }
  const methods = knownMethodsOf(result.methods);
  return withSetCookies(Response.json({ status: 'two-factor-required', methods }), [
    writeTwoFactorCookie({ tempToken: result.tempToken, methods, rememberMe: body.rememberMe }),
  ]);
}

export async function sendTwoFactorEmailCode({
  request,
  body,
  visitorIp,
}: BffContext<z.output<typeof emailCodeBodySchema>>): Promise<Response> {
  const { tempToken } = requireTwoFactorChallenge(request);
  await withExpiredChallengeCleared(() =>
    cmsApiClient.sendEmailChallenge({ tempToken, turnstileToken: body.turnstileToken }, visitorIp),
  );
  return new Response(null, { status: HTTP_STATUS.ACCEPTED });
}

export async function verifyTwoFactorCode({
  request,
  body,
  visitorIp,
}: BffContext<z.output<typeof verifyBodySchema>>): Promise<Response> {
  const { tempToken, rememberMe } = requireTwoFactorChallenge(request);
  const issued = await withExpiredChallengeCleared(() =>
    cmsApiClient.verifyTwoFactor(
      { tempToken, code: body.code, turnstileToken: body.turnstileToken },
      visitorIp,
    ),
  );
  const { user, setCookies } = await sealSession(issued, rememberMe, visitorIp);
  return withSetCookies(Response.json({ user }), setCookies);
}

/** Both cookies go whatever cms-api answers: a failed call must not keep the visitor signed in. */
export async function logOutVisitor({
  request,
  visitorIp,
}: BffContext<unknown>): Promise<Response> {
  const session = readSessionCookie(request).value;
  if (session !== null) {
    await cmsApiClient.logOut(session.refreshToken, visitorIp).catch(() => undefined);
  }
  return withSetCookies(new Response(null, { status: HTTP_STATUS.NO_CONTENT }), [
    clearSessionCookie(),
    clearTwoFactorCookie(),
  ]);
}
