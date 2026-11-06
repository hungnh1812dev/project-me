import 'server-only';

import { z } from 'zod';

import { BffError } from '@/apis/server/bff/Bff.errors';
import { BffContext, HUMAN_CHECK_TOKEN_FIELD } from '@/apis/server/bff/BffRoute.server';
import { cmsApiClient, IssuedTokens } from '@/apis/server/restful/CmsApi.client';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  TWO_FACTOR_CODE_MAX_LENGTH,
  TWO_FACTOR_METHODS,
} from '@/configs/Auth.constants';
import { HTTP_STATUS } from '@/configs/Http.constants';
import { TURNSTILE } from '@/configs/Security.constants';

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

const humanCheckToken = z.string().min(1).max(TURNSTILE.TOKEN_MAX_LENGTH);

export const loginBodySchema = z.object({
  email: z.string().min(1).max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  [HUMAN_CHECK_TOKEN_FIELD]: humanCheckToken,
});
export const emailCodeBodySchema = z.object({ [HUMAN_CHECK_TOKEN_FIELD]: humanCheckToken });
export const verifyBodySchema = z.object({
  code: z.string().min(1).max(TWO_FACTOR_CODE_MAX_LENGTH),
  [HUMAN_CHECK_TOKEN_FIELD]: humanCheckToken,
});

/** What `handle` receives: the pipeline strips the human-check token. */
type HandledBody<TSchema extends z.ZodObject> = Omit<
  z.output<TSchema>,
  typeof HUMAN_CHECK_TOKEN_FIELD
>;

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
async function sealSession(issued: IssuedTokens, visitorIp: string | undefined) {
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
  };
  return {
    user: publicUserOf(account),
    setCookies: [writeSessionCookie(session), clearTwoFactorCookie()],
  };
}

export async function logInVisitor({
  body,
  visitorIp,
}: BffContext<HandledBody<typeof loginBodySchema>>): Promise<Response> {
  const result = await cmsApiClient.logIn(
    { email: body.email, password: body.password },
    visitorIp,
  );
  if (result.kind === 'signed-in') {
    const { user, setCookies } = await sealSession(result, visitorIp);
    return withSetCookies(Response.json({ status: 'signed-in', user }), setCookies);
  }
  const methods = knownMethodsOf(result.methods);
  return withSetCookies(Response.json({ status: 'two-factor-required', methods }), [
    writeTwoFactorCookie({ tempToken: result.tempToken, methods }),
  ]);
}

export async function sendTwoFactorEmailCode({
  request,
  visitorIp,
}: BffContext<unknown>): Promise<Response> {
  const { tempToken } = requireTwoFactorChallenge(request);
  await withExpiredChallengeCleared(() => cmsApiClient.sendEmailChallenge(tempToken, visitorIp));
  return new Response(null, { status: HTTP_STATUS.ACCEPTED });
}

export async function verifyTwoFactorCode({
  request,
  body,
  visitorIp,
}: BffContext<HandledBody<typeof verifyBodySchema>>): Promise<Response> {
  const { tempToken } = requireTwoFactorChallenge(request);
  const issued = await withExpiredChallengeCleared(() =>
    cmsApiClient.verifyTwoFactor({ tempToken, code: body.code }, visitorIp),
  );
  const { user, setCookies } = await sealSession(issued, visitorIp);
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
