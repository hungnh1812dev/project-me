import { test as base, type Page, type Route } from '@playwright/test';

import type { MeUser, Role } from '../../src/features/auth/types.ts';

/** One API call the app made, recorded by the mock with the status it answered. */
export interface RecordedRequest {
  method: string;
  path: string;
  status: number;
}

/** Seeded-style roles. Roles are data: a spec can also pass its own. */
export const ROLES = {
  superAdmin: makeRole('super_admin', 'Super Admin', 100, [
    'user:read',
    'user:manager',
    'user:role_manager',
    'role:manager',
    'document:read',
  ]),
  editor: makeRole('editor', 'Editor', 20, ['document:read', 'document:update']),
} satisfies Record<string, Role>;

export interface MockUserInput {
  email: string;
  password?: string;
  name?: string;
  username?: string;
  verified?: boolean;
  /** Defaults to `ROLES.editor`. `null` means no role assigned. */
  role?: Role | null;
}

/** The password every mock user has unless the spec sets one. */
export const DEFAULT_PASSWORD = 'correct-horse';

export interface MockApi {
  /** Every `/api/v1/**` request the page made, in order. */
  readonly requests: RecordedRequest[];
  /** Adds a user who can sign in. `has-users` answers `true` once there is one. */
  addUser(input: MockUserInput): MeUser;
  /** Starts a refresh-cookie session for `email`, as if they had signed in before this page load. */
  signInAs(email: string): void;
  /** Every access token issued so far stops working (401). The refresh cookie still works. */
  expireAccessTokens(): void;
  /** The refresh cookie stops working: the next refresh gets a 401. */
  revokeSession(): void;
  /** The next `times` calls to `method path` (e.g. `POST /auth/refresh`) answer `status`. */
  failNext(method: string, path: string, status: number, times?: number): void;
}

interface StoredUser {
  password: string;
  me: MeUser;
}

const API_PATTERN = '**/api/v1/**';
const API_PREFIX = '/api/v1';
const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function makeRole(slug: string, name: string, level: number, permissions: string[]): Role {
  return {
    documentId: `role-${slug}`,
    name,
    slug,
    permissions,
    level,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: null,
  };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** A Nest-style error envelope. */
function errorBody(status: number, message: string) {
  return { statusCode: status, message, error: STATUS_TEXT[status] ?? 'Error' };
}

/**
 * Routes all `/api/v1/**` traffic to an in-test fake backend, so no spec reaches a real one.
 *
 * It models users and roles, access-token issuing, and the httpOnly refresh-cookie session. The
 * cookie is held by the fixture, not the browser: it survives reloads within a test, and every
 * refresh rotates it. Anything not modelled answers a Nest-style 404.
 */
export async function installMockApi(page: Page): Promise<MockApi> {
  const requests: RecordedRequest[] = [];
  const users = new Map<string, StoredUser>();
  const accessTokens = new Map<string, string>(); // token → email
  const failures: { key: string; status: number; left: number }[] = [];
  let session: { email: string; cookie: number } | null = null;
  let tokenCounter = 0;

  function issueAccessToken(email: string): string {
    tokenCounter += 1;
    const token = `access-${tokenCounter}`;
    accessTokens.set(token, email);
    return token;
  }

  function startSession(email: string): void {
    session = { email, cookie: (session?.cookie ?? 0) + 1 };
  }

  function takeFailure(key: string): number | null {
    const failure = failures.find((f) => f.key === key && f.left > 0);
    if (!failure) return null;
    failure.left -= 1;
    return failure.status;
  }

  async function handle(route: Route, method: string, path: string): Promise<number> {
    const forced = takeFailure(`${method} ${path}`);
    if (forced !== null) {
      await json(route, forced, errorBody(forced, `Forced ${forced}`));
      return forced;
    }

    if (method === 'GET' && path === '/auth/has-users') {
      await json(route, 200, { hasUsers: users.size > 0 });
      return 200;
    }

    if (method === 'POST' && path === '/auth/login') {
      const { email, password } = (route.request().postDataJSON() ?? {}) as {
        email?: string;
        password?: string;
      };
      const user = email ? users.get(email) : undefined;
      if (!user || user.password !== password) {
        await json(route, 401, errorBody(401, 'Invalid credentials'));
        return 401;
      }
      if (!user.me.verified) {
        await json(route, 403, errorBody(403, 'Email not verified'));
        return 403;
      }
      startSession(user.me.email);
      await json(route, 200, {
        message: 'Login successful',
        accessToken: issueAccessToken(email!),
      });
      return 200;
    }

    if (method === 'POST' && path === '/auth/refresh') {
      if (!session) {
        await json(route, 401, errorBody(401, 'Refresh token missing'));
        return 401;
      }
      startSession(session.email);
      await json(route, 200, {
        message: 'Token refreshed',
        accessToken: issueAccessToken(session.email),
      });
      return 200;
    }

    if (method === 'POST' && path === '/auth/logout') {
      session = null;
      await json(route, 200, { message: 'Logged out' });
      return 200;
    }

    if (method === 'GET' && path === '/auth/me') {
      const header = route.request().headers()['authorization'] ?? '';
      const email = accessTokens.get(header.replace(/^Bearer /, ''));
      const user = email ? users.get(email) : undefined;
      if (!user) {
        await json(route, 401, errorBody(401, 'Unauthorized'));
        return 401;
      }
      await json(route, 200, user.me);
      return 200;
    }

    await json(route, 404, errorBody(404, `Not mocked: ${method} ${API_PREFIX}${path}`));
    return 404;
  }

  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    const fullPath = new URL(request.url()).pathname;
    const path = fullPath.slice(fullPath.indexOf(API_PREFIX) + API_PREFIX.length);
    const status = await handle(route, request.method(), path);
    requests.push({ method: request.method(), path: fullPath, status });
  });

  return {
    requests,
    addUser(input) {
      const username = input.username ?? input.email.split('@')[0];
      const role = input.role === undefined ? ROLES.editor : input.role;
      const me: MeUser = {
        documentId: `user-${users.size + 1}`,
        email: input.email,
        name: input.name ?? username,
        username,
        accountType: false,
        verified: input.verified ?? true,
        roleId: role?.documentId ?? null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        role,
      };
      users.set(input.email, { password: input.password ?? DEFAULT_PASSWORD, me });
      return me;
    },
    signInAs(email) {
      if (!users.has(email)) throw new Error(`signInAs: no mock user ${email}`);
      startSession(email);
    },
    expireAccessTokens() {
      accessTokens.clear();
    },
    revokeSession() {
      session = null;
    },
    failNext(method, path, status, times = 1) {
      failures.push({ key: `${method} ${path}`, status, left: times });
    },
  };
}

/** Playwright `test` with the API mocked for every spec that imports it. */
export const test = base.extend<{ mockApi: MockApi }>({
  mockApi: [
    async ({ page }, use) => {
      await use(await installMockApi(page));
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
