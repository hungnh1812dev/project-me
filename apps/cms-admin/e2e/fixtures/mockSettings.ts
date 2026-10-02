import type { Route } from '@playwright/test';

import type { MeUser, Role } from '../../src/features/auth/types.ts';
import type {
  AccessToken,
  MediaAsset,
  Permission,
  User,
} from '../../src/features/settings/types.ts';

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
  /** Removes a user from `mockApi` (U4): they can no longer sign in. */
  removeUser(documentId: string): void;
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
  /** Removes a permission (P4). */
  removePermission(documentId: string): void;
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

/** A `User` as U1–U3 answer it: the `MeUser` without its joined `role`. */
function toUser({ role: _role, ...user }: MeUser): User {
  return user;
}

const levelOf = (user: MeUser) => user.role?.level ?? 0;

/** The backend's hierarchy rule on U3 and U4: the actor must outrank the target. */
const HIERARCHY = 'You can only manage users with a lower role level.';

/** Users (U1, U3, U4) and the roles list (R1). U3 and U4 enforce the level hierarchy. */
const USERS_ROUTES: SettingsRoute[] = [
  {
    method: 'GET',
    pattern: /^\/users$/,
    permission: 'user:read',
    handle: (route, { store }) => sendJson(route, 200, store.users().map(toUser)),
  },
  {
    method: 'PATCH',
    pattern: /^\/users\/([^/]+)\/role$/,
    permission: 'user:role_manager',
    handle: async (route, { user: me, params: [id], store }) => {
      const target = store.users().find((u) => u.documentId === id);
      if (!target) return sendError(route, 404, 'User not found');
      const { roleId } = (route.request().postDataJSON() ?? {}) as { roleId?: string };
      const role = store.roles.find((r) => r.documentId === roleId);
      if (!role) return sendError(route, 404, 'Role not found');
      if (target.documentId === me.documentId || levelOf(target) >= levelOf(me)) {
        return sendError(route, 403, HIERARCHY);
      }
      if (role.level >= levelOf(me)) {
        return sendError(route, 403, 'You can only assign a role below your own level.');
      }
      // `mockApi` holds the same object, so the change also reaches `/auth/me`.
      Object.assign(target, { roleId: role.documentId, role });
      return sendJson(route, 200, toUser(target));
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/users\/([^/]+)$/,
    permission: 'user:manager',
    handle: async (route, { user: me, params: [id], store }) => {
      const target = store.users().find((u) => u.documentId === id);
      if (!target) return sendError(route, 404, 'User not found');
      if (target.documentId === me.documentId || levelOf(target) >= levelOf(me)) {
        return sendError(route, 403, HIERARCHY);
      }
      store.removeUser(id);
      await route.fulfill({ status: 204 });
      return 204;
    },
  },
  {
    method: 'GET',
    pattern: /^\/roles$/,
    permission: 'role:read',
    handle: (route, { store }) => sendJson(route, 200, store.roles),
  },
];

const PERMISSION_SLUG = /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/;

/**
 * The permission catalog (P1 to P4). P2 answers 400 for an invalid body and 409 for a known slug.
 * P4 answers 409 with `{ roleCount, accessTokenCount }`, counted from the store, while a role or
 * an access token still grants the slug.
 */
const PERMISSIONS_ROUTES: SettingsRoute[] = [
  {
    method: 'GET',
    pattern: /^\/permissions$/,
    permission: 'permission:read',
    handle: (route, { store }) => sendJson(route, 200, store.permissions),
  },
  {
    method: 'POST',
    pattern: /^\/permissions$/,
    permission: 'permission:manager',
    handle: (route, { user, store }) => {
      const { slug, name, description } = (route.request().postDataJSON() ?? {}) as Partial<
        Record<'slug' | 'name' | 'description', unknown>
      >;
      if (typeof slug !== 'string' || !PERMISSION_SLUG.test(slug)) {
        return sendError(route, 400, 'slug must be resource:action');
      }
      if (typeof name !== 'string' || !name || typeof description !== 'string') {
        return sendError(route, 400, 'name and description are required');
      }
      if (store.permissions.some((p) => p.slug === slug)) {
        return sendError(route, 409, `Permission "${slug}" already exists`);
      }
      const permission: Permission = {
        ...catalogPermission(slug),
        name,
        description,
        updatedBy: user.documentId,
      };
      store.addPermission(permission);
      return sendJson(route, 201, permission);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/permissions\/([^/]+)$/,
    permission: 'permission:manager',
    handle: (route, { user, params: [id], store }) => {
      const permission = store.permissions.find((p) => p.documentId === id);
      if (!permission) return sendError(route, 404, 'Permission not found');
      const { name, description } = (route.request().postDataJSON() ?? {}) as Partial<
        Pick<Permission, 'name' | 'description'>
      >;
      Object.assign(permission, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        updatedAt: new Date().toISOString(),
        updatedBy: user.documentId,
      });
      return sendJson(route, 200, permission);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/permissions\/([^/]+)$/,
    permission: 'permission:manager',
    handle: async (route, { params: [id], store }) => {
      const index = store.permissions.findIndex((p) => p.documentId === id);
      const permission = store.permissions[index];
      if (!permission) return sendError(route, 404, 'Permission not found');
      const roleCount = store.roles.filter((r) => r.permissions.includes(permission.slug)).length;
      const accessTokenCount = store.accessTokens.filter((t) =>
        t.permissions.includes(permission.slug),
      ).length;
      if (roleCount + accessTokenCount > 0) {
        return sendJson(route, 409, {
          statusCode: 409,
          message: 'Permission is still in use',
          error: STATUS_TEXT[409],
          roleCount,
          accessTokenCount,
        });
      }
      store.removePermission(id);
      await route.fulfill({ status: 204 });
      return 204;
    },
  },
];

/** The routes the fake settings backend models. Anything else under its prefixes answers 404. */
export const SETTINGS_ROUTES: SettingsRoute[] = [...USERS_ROUTES, ...PERMISSIONS_ROUTES];

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
export function createMockSettings(
  users: () => MeUser[],
  removeUser: (documentId: string) => void,
) {
  const roles: Role[] = [];
  const permissions: Permission[] = PERMISSION_CATALOG.map(catalogPermission);
  const accessTokens: AccessToken[] = [];
  const media: MediaAsset[] = [];

  const settings: MockSettings = {
    users,
    removeUser,
    roles,
    permissions,
    accessTokens,
    media,
    addRole: (role) => upsert(roles, role),
    addPermission: (permission) => upsert(permissions, permission),
    removePermission: (documentId) => {
      const index = permissions.findIndex((p) => p.documentId === documentId);
      if (index !== -1) permissions.splice(index, 1);
    },
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
