import 'server-only';

import { BffError } from '../../apis/server/bff/Bff.errors';
import type { BffContext } from '../../apis/server/bff/BffRoute.server';
import { visitorIpOf } from '../../apis/server/bff/ClientIp.rules';
import { cmsApiClient, type CurrentAccount } from '../../apis/server/restful/CmsApi.client';
import {
  ACCESS_REFRESH_LEAD_MS,
  PERMISSION_STRING_SEPARATOR,
  READ_ACTION,
  REFRESH_RESULT_SHARE_MS,
} from '../../configs/Auth.constants';
import { getServerEnv } from '../../configs/Server.env';
import {
  clearSessionCookie,
  clearTwoFactorCookie,
  readSessionCookie,
  withSetCookies,
  writeSessionCookie,
  type SealedWebSession,
} from './SealedCookie.server';

const MS_PER_SECOND = 1000;

export type WebSessionRead =
  | { status: 'signed-out'; setCookies: string[] }
  | {
      status: 'signed-in';
      account: CurrentAccount;
      accessToken: string;
      /** A rotated cookie the answer must carry; empty when nothing changed. */
      setCookies: string[];
    };

interface SharedRefresh {
  /** Null when cms-api refused the refresh token. */
  result: Promise<SealedWebSession | null>;
  settledAt?: number;
}

/** In-process, single replica (D16): one refresh call per refresh token. */
const refreshes = new Map<string, SharedRefresh>();

/** The `exp` claim in ms, read without a signature check: it only times the refresh. */
export function accessExpiryOf(accessToken: string): number | null {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp)
      ? claims.exp * MS_PER_SECOND
      : null;
  } catch {
    return null;
  }
}

export function isPrivilegedAccount(account: CurrentAccount): boolean {
  return account.permissions.some(
    (permission) => permission.split(PERMISSION_STRING_SEPARATOR).pop() !== READ_ACTION,
  );
}

function dropExpiredRefreshes(now: number): void {
  for (const [token, entry] of refreshes) {
    if (entry.settledAt !== undefined && now - entry.settledAt >= REFRESH_RESULT_SHARE_MS) {
      refreshes.delete(token);
    }
  }
}

async function refreshOnce(
  refreshToken: string,
  visitorIp: string | undefined,
): Promise<SealedWebSession | null> {
  const issued = await cmsApiClient.refreshSession(refreshToken, visitorIp);
  if (issued === null) return null;
  const accessExpiresAt = accessExpiryOf(issued.accessToken);
  if (accessExpiresAt === null) throw new BffError('BFF_UPSTREAM_FAILED');
  return {
    refreshToken: issued.refreshToken ?? refreshToken,
    accessToken: issued.accessToken,
    accessExpiresAt,
  };
}

/** Concurrent reads of one refresh token share one call; its result is kept briefly after it settles. */
function refreshShared(
  refreshToken: string,
  visitorIp: string | undefined,
): Promise<SealedWebSession | null> {
  dropExpiredRefreshes(Date.now());
  const shared = refreshes.get(refreshToken);
  if (shared) return shared.result;
  const entry: SharedRefresh = { result: refreshOnce(refreshToken, visitorIp) };
  refreshes.set(refreshToken, entry);
  entry.result.then(
    () => {
      entry.settledAt = Date.now();
    },
    () => {
      // A failed call is not shared: the next read tries again.
      refreshes.delete(refreshToken);
    },
  );
  return entry.result;
}

async function refuseDueToPrivilege(
  refreshToken: string,
  visitorIp: string | undefined,
): Promise<never> {
  await cmsApiClient.logOut(refreshToken, visitorIp).catch(() => undefined);
  throw new BffError('BFF_PRIVILEGED_ACCOUNT', {}, [clearSessionCookie(), clearTwoFactorCookie()]);
}

/**
 * Who the request is signed in as. An unreadable cookie reads as signed out
 * and is cleared; a due access token is refreshed; a privileged account is
 * logged out at cms-api and refused with `BFF_PRIVILEGED_ACCOUNT`.
 */
export async function readWebSession(request: Request): Promise<WebSessionRead> {
  const cookie = readSessionCookie(request);
  if (cookie.value === null) {
    return { status: 'signed-out', setCookies: cookie.isPresent ? [clearSessionCookie()] : [] };
  }
  const visitorIp = visitorIpOf(request.headers, getServerEnv());
  let session = cookie.value;
  const setCookies: string[] = [];

  if (session.accessExpiresAt - Date.now() < ACCESS_REFRESH_LEAD_MS) {
    const refreshed = await refreshShared(session.refreshToken, visitorIp);
    if (refreshed === null) return { status: 'signed-out', setCookies: [clearSessionCookie()] };
    session = refreshed;
    setCookies.push(writeSessionCookie(session));
  }

  const account = await cmsApiClient.readCurrentAccount(session.accessToken, visitorIp);
  if (account === null) return { status: 'signed-out', setCookies: [clearSessionCookie()] };
  if (isPrivilegedAccount(account)) return refuseDueToPrivilege(session.refreshToken, visitorIp);
  return { status: 'signed-in', account, accessToken: session.accessToken, setCookies };
}

/** The only account fields that leave the server (api-contract "Web BFF"). */
export function publicUserOf(account: CurrentAccount) {
  const { id, email, displayName, role } = account;
  return { id, email, displayName, role };
}

/** `GET /api/v1/session`: the signed-in visitor or `null`, carrying a rotated or cleared cookie. */
export async function answerSessionRead({ request }: BffContext<unknown>): Promise<Response> {
  const read = await readWebSession(request);
  const user = read.status === 'signed-in' ? publicUserOf(read.account) : null;
  return withSetCookies(Response.json({ user }), read.setCookies);
}
