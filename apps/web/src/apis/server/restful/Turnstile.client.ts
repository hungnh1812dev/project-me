import 'server-only';

import { z } from 'zod';

import { API_TIMEOUT_MS, CONTENT_TYPE_HEADER, JSON_MEDIA_TYPE } from '@/configs/Http.constants';
import { TURNSTILE, type TurnstileAction } from '@/configs/Security.constants';
import { getServerEnv } from '@/configs/Server.env';

import { BffError } from '../bff/Bff.errors';

const siteverifyAnswer = z.object({
  success: z.boolean(),
  action: z.string().optional(),
  hostname: z.string().optional(),
});

async function askSiteverify(
  token: string,
  visitorIp: string | undefined,
): Promise<z.infer<typeof siteverifyAnswer>> {
  try {
    const response = await fetch(TURNSTILE.SITEVERIFY_URL, {
      method: 'POST',
      headers: { [CONTENT_TYPE_HEADER]: JSON_MEDIA_TYPE },
      body: JSON.stringify({
        secret: getServerEnv().turnstileSecretKey,
        response: token,
        ...(visitorIp !== undefined && { remoteip: visitorIp }),
      }),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    return siteverifyAnswer.parse(await response.json());
  } catch {
    throw new BffError('BFF_HUMAN_CHECK_UNAVAILABLE');
  }
}

/**
 * Verifies a Turnstile token with Cloudflare (D21). Fails closed: a missing or
 * unsuccessful token is `BFF_HUMAN_CHECK_FAILED`; siteverify unreachable or not
 * JSON is `BFF_HUMAN_CHECK_UNAVAILABLE`. The action is compared unless the
 * secret is Cloudflare's always-pass test secret; the hostname is compared
 * whenever `TURNSTILE_EXPECTED_HOSTNAME` is set.
 */
export async function verifyHumanCheck(
  token: unknown,
  expectedAction: TurnstileAction,
  visitorIp: string | undefined,
): Promise<void> {
  if (typeof token !== 'string' || token === '' || token.length > TURNSTILE.TOKEN_MAX_LENGTH) {
    throw new BffError('BFF_HUMAN_CHECK_FAILED');
  }
  const { turnstileSecretKey, turnstileExpectedHostname } = getServerEnv();
  const answer = await askSiteverify(token, visitorIp);
  const isActionChecked = turnstileSecretKey !== TURNSTILE.ALWAYS_PASS_TEST_SECRET;
  const isActionWrong = isActionChecked && answer.action !== expectedAction;
  const isHostnameWrong =
    turnstileExpectedHostname !== undefined && answer.hostname !== turnstileExpectedHostname;
  if (!answer.success || isActionWrong || isHostnameWrong) {
    throw new BffError('BFF_HUMAN_CHECK_FAILED');
  }
}
