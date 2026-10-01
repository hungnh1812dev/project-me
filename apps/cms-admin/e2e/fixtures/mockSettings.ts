import type { Route } from '@playwright/test';

import type { MeUser, Role } from '../../src/features/auth/types.ts';
import type { AccessToken, MediaAsset, Permission } from '../../src/features/settings/types.ts';

/**
 * The seeded permission catalog (legacy `cms-admin-integration.md` §4), in catalog order. Scoped
 * `document:<action>:<slug>` entries are added per spec with `addPermission`.
 */
export const PERMISSION_CATALOG = [
  'document:read',
  'document:create',
  'document:update',
  'document:delete',
  'document:publish',
  'document:unpublish',
  'user:read',
  'user:manager',
  'user:role_manager',
  'role:read',
  'role:manager',
  'permission:read',
  'permission:manager',
  'api_token:read',
  'api_token:manager',
  'media:read',
  'media:manager',
  'content_type:read',
] as const;

/** The fake settings backend that `mockApi` delegates `/users*`, `/roles*`, `/permissions*`, `/access-tokens*` and `/media*` to. */
export interface MockSettings {
  /** Every user `mockApi` models, as `MeUser` (U1 strips `role`). */
  users(): MeUser[];
  /** R1's store. `mockApi` adds each user's role when the user is added. */
  readonly roles: Role[];
  /** P1's store, seeded with `PERMISSION_CATALOG`. */
  readonly permissions: Permission[];
  /** T1's store (no secrets). */
  readonly accessTokens: AccessToken[];
  /** M1's store, newest first. */
  readonly media: MediaAsset[];
  /** Adds a role, or replaces the one with the same `documentId`. */
  addRole(role: Role): void;
  /** Adds a permission, or replaces the one with the same `documentId`. */
  addPermission(permission: Permission): void;
  addAccessToken(token: AccessToken): void;
  /** Adds an asset at the front (newest first). */
  addMedia(asset: MediaAsset): void;
}

/** One settings request, as `mockApi` hands it over. */
export interface SettingsRequest {
  method: string;
  /** The path below `/api/v1`, without the query string. */
  path: string;
  query: URLSearchParams;
  /** The bearer token's user, or `null` when the token is missing or expired. */
  user: MeUser | null;
}

/** What a modelled route gets: the request, the signed-in user and the store. */
export interface SettingsContext extends SettingsRequest {
  user: MeUser;
  /** The path params the route's pattern captured, already decoded. */
  params: string[];
  store: MockSettings;
}

/** A modelled route. Each Phase 4 slice adds its own to `SETTINGS_ROUTES`. */
export interface SettingsRoute {
  method: string;
  /** Matched against the path; capture groups become `params`. */
  pattern: RegExp;
  /** Checked with `requirePermission` before `handle`; `null` means bearer only (U2). */
  permission: string | null;
  handle(route: Route, context: SettingsContext): Promise<number>;
}

/** The routes the fake settings backend models. Anything else under its prefixes answers 404. */
export const SETTINGS_ROUTES: SettingsRoute[] = [];

const PREFIXES = /^\/(users|roles|permissions|access-tokens|media)(\/|$)/;
const STAMP = '2026-01-01T00:00:00.000Z';
const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  422: 'Unprocessable Entity',
};

/** Answers a JSON body and returns the status. */
export async function sendJson(route: Route, status: number, body: unknown): Promise<number> {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  return status;
}

/** Answers a Nest-style error envelope and returns the status. */
export function sendError(route: Route, status: number, message: string): Promise<number> {
  return sendJson(route, status, {
    statusCode: status,
    message,
    error: STATUS_TEXT[status] ?? 'Error',
  });
}

/** The backend's permission check: an exact match, or `<res>:manager` for `<res>:read`. */
export function requirePermission(me: MeUser, slug: string): boolean {
  const granted = me.role?.permissions ?? [];
  if (granted.includes(slug)) return true;
  const [resource, action] = slug.split(':');
  return action === 'read' && granted.includes(`${resource}:manager`);
}

/** A catalog `Permission` for `slug`, with a stable id such as `perm-role-read`. */
export function catalogPermission(slug: string): Permission {
  return {
    documentId: `perm-${slug.replaceAll(':', '-')}`,
    slug,
    name: slug,
    description: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: null,
  };
}

function upsert<T extends { documentId: string }>(list: T[], item: T): void {
  const index = list.findIndex((existing) => existing.documentId === item.documentId);
  if (index === -1) list.push(item);
  else list[index] = item;
}

/**
 * Creates the in-memory settings store and its request handler. `users` reads the users `mockApi`
 * already models, so `addUser` and `signInAs` keep working and U1 lists them.
 */
export function createMockSettings(users: () => MeUser[]) {
  const roles: Role[] = [];
  const permissions: Permission[] = PERMISSION_CATALOG.map(catalogPermission);
  const accessTokens: AccessToken[] = [];
  const media: MediaAsset[] = [];

  const settings: MockSettings = {
    users,
    roles,
    permissions,
    accessTokens,
    media,
    addRole: (role) => upsert(roles, role),
    addPermission: (permission) => upsert(permissions, permission),
    addAccessToken: (token) => upsert(accessTokens, token),
    addMedia: (asset) => {
      media.unshift(asset);
    },
  };

  /** Answers a settings request and returns its status, or `null` when the path is not a settings path. */
  async function handle(route: Route, request: SettingsRequest): Promise<number | null> {
    if (!PREFIXES.test(request.path)) return null;
    const { user } = request;
    if (!user) return sendError(route, 401, 'Unauthorized');

    for (const candidate of SETTINGS_ROUTES) {
      if (candidate.method !== request.method) continue;
      const match = candidate.pattern.exec(request.path);
      if (!match) continue;
      if (candidate.permission && !requirePermission(user, candidate.permission)) {
        return sendError(route, 403, 'Forbidden resource');
      }
      const params = match.slice(1).map((part) => decodeURIComponent(part));
      return candidate.handle(route, { ...request, user, params, store: settings });
    }

    return sendError(route, 404, `Not mocked: ${request.method} /api/v1${request.path}`);
  }

  return { settings, handle };
}
