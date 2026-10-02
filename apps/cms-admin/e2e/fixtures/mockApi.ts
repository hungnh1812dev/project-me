import { test as base, type Page, type Route } from '@playwright/test';

import type { MeUser, Role } from '../../src/features/auth/types.ts';
import { createMockContent, type MockContent } from './mockContent.ts';
import { createMockSettings, PERMISSION_CATALOG, type MockSettings } from './mockSettings.ts';

/** One API call the app made, recorded by the mock with the status it answered. */
export interface RecordedRequest {
  method: string;
  /** The full path, including the query string when there is one. */
  path: string;
  status: number;
}

/** Seeded-style roles. Roles are data: a spec can also pass its own. */
export const ROLES = {
  /** Level 100 with every catalog slug, as seeded. */
  superAdmin: makeRole('super_admin', 'Super Admin', 100, [...PERMISSION_CATALOG]),
  /** Level 50, read-only: every `<res>:read` of the catalog, as seeded. */
  admin: makeRole(
    'admin',
    'Admin',
    50,
    PERMISSION_CATALOG.filter((slug) => slug.endsWith(':read')),
  ),
  /** Level 100, manages users and roles only (no Content, no other settings). */
  userManager: makeRole('user_manager', 'User Manager', 100, [
    'user:read',
    'user:manager',
    'user:role_manager',
    'role:manager',
    'document:read',
  ]),
  editor: makeRole('editor', 'Editor', 20, ['document:read', 'document:update']),
  contentEditor: makeRole('content_editor', 'Content Editor', 30, [
    'content_type:read',
    'document:read',
    'document:update',
  ]),
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

/** The OTP the mock "emails" on register and resend. Any other code gets a 400. */
export const OTP_CODE = '123456';

export interface MockApi {
  /** Every `/api/v1/**` request the page made, in order. */
  readonly requests: RecordedRequest[];
  /** The content model that answers `/content-types*` and `/documents*`. */
  readonly content: MockContent;
  /** The settings store that answers `/users*`, `/roles*`, `/permissions*`, `/access-tokens*`, `/media*`. */
  readonly settings: MockSettings;
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
  /** The latest access token issued to `email`, for calling the API directly from a spec. */
  latestAccessToken(email: string): string | undefined;
  /** The token in the latest reset link "emailed" to `email`, if any (see `forgot-password`). */
  resetTokenFor(email: string): string | undefined;
}

interface StoredUser {
  password: string;
  me: MeUser;
}

type Body = Record<string, unknown>;

const API_PATTERN = '**/api/v1/**';
const API_PREFIX = '/api/v1';
const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
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

/** Answers a Nest-style error and returns its status, for `handle`'s return value. */
async function reply(route: Route, status: number, message: string): Promise<number> {
  await json(route, status, errorBody(status, message));
  return status;
}

/**
 * Routes all `/api/v1/**` traffic to an in-test fake backend, so no spec reaches a real one.
 *
 * It models users and roles, access-token issuing, and the httpOnly refresh-cookie session, and
 * delegates content and settings paths to `mockContent` and `mockSettings`. The
 * cookie is held by the fixture, not the browser: it survives reloads within a test, and every
 * refresh rotates it. Anything not modelled answers a Nest-style 404.
 */
export async function installMockApi(page: Page): Promise<MockApi> {
  const requests: RecordedRequest[] = [];
  const users = new Map<string, StoredUser>();
  const accessTokens = new Map<string, string>(); // token → email
  const failures: { key: string; status: number; left: number }[] = [];
  const resetTokens = new Map<string, string>(); // token → email
  let session: { email: string; cookie: number } | null = null;
  let tokenCounter = 0;
  let resetCounter = 0;
  const mockContent = createMockContent();
  const mockSettings = createMockSettings(
    () => [...users.values()].map((user) => user.me),
    (documentId) => {
      const entry = [...users].find(([, user]) => user.me.documentId === documentId);
      if (entry) users.delete(entry[0]);
    },
  );

  function createUser(input: MockUserInput): MeUser {
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
    if (role && !mockSettings.settings.roles.some((r) => r.documentId === role.documentId)) {
      mockSettings.settings.addRole(role);
    }
    return me;
  }

  /** register → verify-otp → resend-otp → forgot-password → reset-password. */
  async function handleOnboarding(route: Route, path: string, body: Body): Promise<number | null> {
    const email = typeof body.email === 'string' ? body.email : '';
    const user = users.get(email);

    if (path === '/auth/register') {
      const taken = [...users.values()].some(
        (u) => u.me.email === email || u.me.username === body.username,
      );
      if (taken) return reply(route, 409, 'Email or username already exists');
      createUser({
        email,
        name: String(body.name),
        username: String(body.username),
        password: String(body.password),
        verified: false,
        // The first account is the CMS's administrator.
        role: users.size === 0 ? ROLES.superAdmin : ROLES.editor,
      });
      await json(route, 201, { message: 'Registered. Check your email for the code.' });
      return 201;
    }

    if (path === '/auth/verify-otp' || path === '/auth/resend-otp') {
      if (!user) return reply(route, 404, 'User not found');
      if (user.me.verified) return reply(route, 409, 'Email already verified');
      if (path === '/auth/verify-otp') {
        if (body.otp !== OTP_CODE) return reply(route, 400, 'Invalid or expired OTP');
        user.me = { ...user.me, verified: true };
      }
      await json(route, 200, { message: 'ok' });
      return 200;
    }

    if (path === '/auth/forgot-password') {
      if (user) {
        resetCounter += 1;
        resetTokens.set(`reset-${resetCounter}`, email);
      }
      await json(route, 200, { message: 'If that email exists, a reset link was sent.' });
      return 200;
    }

    if (path === '/auth/reset-password') {
      const owner = typeof body.token === 'string' ? resetTokens.get(body.token) : undefined;
      const stored = owner ? users.get(owner) : undefined;
      if (!stored) return reply(route, 400, 'Invalid or expired token');
      stored.password = String(body.newPassword);
      resetTokens.delete(String(body.token));
      await json(route, 200, { message: 'Password reset' });
      return 200;
    }

    return null;
  }

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

  /** The user behind the request's bearer token, or `null` when it is missing or expired. */
  function bearerUser(route: Route): MeUser | null {
    const header = route.request().headers()['authorization'] ?? '';
    const email = accessTokens.get(header.replace(/^Bearer /, ''));
    return (email && users.get(email)?.me) || null;
  }

  async function handle(
    route: Route,
    method: string,
    path: string,
    query: URLSearchParams,
  ): Promise<number> {
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

    // A multipart body (M2 upload) is not JSON; the settings handler reads it raw.
    const multipart = (route.request().headers()['content-type'] ?? '').startsWith('multipart/');
    if (method === 'POST' && !multipart) {
      const body = (route.request().postDataJSON() ?? {}) as Body;
      const status = await handleOnboarding(route, path, body);
      if (status !== null) return status;
    }

    const content = await mockContent.handle(route, {
      method,
      path,
      query,
      user: bearerUser(route),
    });
    if (content !== null) return content;

    const settings = await mockSettings.handle(route, {
      method,
      path,
      query,
      user: bearerUser(route),
    });
    if (settings !== null) return settings;

    return reply(route, 404, `Not mocked: ${method} ${API_PREFIX}${path}`);
  }

  await page.route(API_PATTERN, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const fullPath = url.pathname;
    const path = fullPath.slice(fullPath.indexOf(API_PREFIX) + API_PREFIX.length);
    const status = await handle(route, request.method(), path, url.searchParams);
    requests.push({ method: request.method(), path: `${fullPath}${url.search}`, status });
  });

  return {
    requests,
    content: mockContent.content,
    settings: mockSettings.settings,
    addUser: createUser,
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
    latestAccessToken(email) {
      return [...accessTokens].findLast(([, owner]) => owner === email)?.[0];
    },
    resetTokenFor(email) {
      return [...resetTokens].findLast(([, owner]) => owner === email)?.[0];
    },
  };
}

/** Playwright `test` with the API mocked for every spec that imports it. */
export const test = base.extend<{
  mockApi: MockApi;
  mockContent: MockContent;
  mockSettings: MockSettings;
}>({
  mockApi: [
    async ({ page }, use) => {
      await use(await installMockApi(page));
    },
    { auto: true },
  ],
  // `provide` is Playwright's `use`, renamed so the React hooks lint rule does not mistake it.
  mockContent: async ({ mockApi }, provide) => {
    await provide(mockApi.content);
  },
  mockSettings: async ({ mockApi }, provide) => {
    await provide(mockApi.settings);
  },
});

export { expect } from '@playwright/test';
