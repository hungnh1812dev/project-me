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
  /** Removes a role (R4). */
  removeRole(documentId: string): void;
  /** Adds a permission, or replaces the one with the same `documentId`. */
  addPermission(permission: Permission): void;
  /** Removes a permission (P4). */
  removePermission(documentId: string): void;
  /** Adds a token (never a secret), or replaces the one with the same `documentId`. */
  addAccessToken(token: AccessToken): void;
  /** Removes a token (T4). */
  removeAccessToken(documentId: string): void;
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

const ROLE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_LOCKED = 'The name and level of a default role cannot be changed';

type RoleBody = Partial<Record<'name' | 'slug' | 'level' | 'permissions', unknown>>;

const isLevel = (level: unknown): level is number =>
  Number.isInteger(level) && (level as number) >= 0 && (level as number) <= 100;

/** The 400 message for a `permissions` body that is not a list of catalog slugs, or `null`. */
function permissionsError(permissions: unknown, store: MockSettings): string | null {
  if (!Array.isArray(permissions) || permissions.some((slug) => typeof slug !== 'string')) {
    return 'permissions must be an array of slugs';
  }
  const unknown = permissions.filter((slug) => !store.permissions.some((p) => p.slug === slug));
  return unknown.length > 0 ? `Unknown permission slugs: ${unknown.join(', ')}` : null;
}

/**
 * Roles (R2 to R4). R2 answers 400 for an invalid body or an unknown permission slug and 409 for a
 * known slug. R3 answers 400 when a default role's name or level changes, and the new role reaches
 * every user holding it (so `/auth/me` follows). R4 answers 400 for a default role and 409 while a
 * user still holds the role. Roles are replaced, never mutated, because `ROLES` is shared.
 */
const ROLES_ROUTES: SettingsRoute[] = [
  {
    method: 'POST',
    pattern: /^\/roles$/,
    permission: 'role:manager',
    handle: (route, { user, store }) => {
      const { name, slug, level, permissions } = (route.request().postDataJSON() ?? {}) as RoleBody;
      if (typeof name !== 'string' || !name.trim())
        return sendError(route, 400, 'name is required');
      if (typeof slug !== 'string' || !ROLE_SLUG.test(slug)) {
        return sendError(route, 400, 'slug must be lowercase words joined by dashes');
      }
      if (!isLevel(level)) return sendError(route, 400, 'level must be an integer from 0 to 100');
      const invalid = permissionsError(permissions, store);
      if (invalid) return sendError(route, 400, invalid);
      if (store.roles.some((r) => r.slug === slug)) {
        return sendError(route, 409, `Role "${slug}" already exists`);
      }
      const now = new Date().toISOString();
      const role: Role = {
        documentId: `role-${slug}`,
        name,
        slug,
        level,
        permissions: permissions as string[],
        isDefault: false,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.documentId,
      };
      store.addRole(role);
      return sendJson(route, 201, role);
    },
  },
  {
    method: 'PUT',
    pattern: /^\/roles\/([^/]+)$/,
    permission: 'role:manager',
    handle: (route, { user, params: [id], store }) => {
      const role = store.roles.find((r) => r.documentId === id);
      if (!role) return sendError(route, 404, 'Role not found');
      const { name, level, permissions } = (route.request().postDataJSON() ?? {}) as RoleBody;
      if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
        return sendError(route, 400, 'name must not be empty');
      }
      if (level !== undefined && !isLevel(level)) {
        return sendError(route, 400, 'level must be an integer from 0 to 100');
      }
      if (
        role.isDefault &&
        ((name !== undefined && name !== role.name) ||
          (level !== undefined && level !== role.level))
      ) {
        return sendError(route, 400, DEFAULT_LOCKED);
      }
      if (permissions !== undefined) {
        const invalid = permissionsError(permissions, store);
        if (invalid) return sendError(route, 400, invalid);
      }
      const updated: Role = {
        ...role,
        ...(name !== undefined && { name: name as string }),
        ...(level !== undefined && { level: level as number }),
        ...(permissions !== undefined && { permissions: permissions as string[] }),
        updatedAt: new Date().toISOString(),
        updatedBy: user.documentId,
      };
      store.addRole(updated);
      for (const holder of store.users().filter((u) => u.roleId === id)) {
        Object.assign(holder, { role: updated });
      }
      return sendJson(route, 200, updated);
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/roles\/([^/]+)$/,
    permission: 'role:manager',
    handle: async (route, { params: [id], store }) => {
      const role = store.roles.find((r) => r.documentId === id);
      if (!role) return sendError(route, 404, 'Role not found');
      if (role.isDefault) return sendError(route, 400, 'A default role cannot be deleted');
      if (store.users().some((u) => u.roleId === id)) {
        return sendError(route, 409, 'Role is still assigned to users');
      }
      store.removeRole(id);
      await route.fulfill({ status: 204 });
      return 204;
    },
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

const EXPIRES_IN_MS: Record<string, number | null> = {
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '1m': 30 * 24 * 60 * 60_000,
  '1y': 365 * 24 * 60 * 60_000,
  never: null,
};

let secretCount = 0;

/** A fresh plaintext secret, unique per call. */
function newSecret(): string {
  secretCount += 1;
  return `cms_live_${secretCount}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Access tokens (T1 to T4). The store never holds a secret: T2 and T3 answer one, fresh each time,
 * and forget it. T2 answers 400 for an empty name, an unknown `expiresIn` or an unknown permission
 * slug. T3 keeps the record's name, permissions and expiry and rotates only the secret. T3 and T4
 * answer 404 for an unknown id.
 */
const ACCESS_TOKENS_ROUTES: SettingsRoute[] = [
  {
    method: 'GET',
    pattern: /^\/access-tokens$/,
    permission: 'api_token:read',
    handle: (route, { store }) => sendJson(route, 200, store.accessTokens),
  },
  {
    method: 'POST',
    pattern: /^\/access-tokens$/,
    permission: 'api_token:manager',
    handle: (route, { user, store }) => {
      const { name, permissions, expiresIn } = (route.request().postDataJSON() ?? {}) as Partial<
        Record<'name' | 'permissions' | 'expiresIn', unknown>
      >;
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(route, 400, 'name is required');
      }
      if (typeof expiresIn !== 'string' || !(expiresIn in EXPIRES_IN_MS)) {
        return sendError(route, 400, 'expiresIn must be one of 30m, 1h, 1d, 1m, 1y, never');
      }
      const invalid = permissionsError(permissions, store);
      if (invalid) return sendError(route, 400, invalid);
      const now = new Date();
      const lifetime = EXPIRES_IN_MS[expiresIn] ?? null;
      const token: AccessToken = {
        documentId: `tok-${now.getTime()}-${store.accessTokens.length + 1}`,
        name,
        permissions: permissions as string[],
        expiresAt: lifetime === null ? null : new Date(now.getTime() + lifetime).toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updatedBy: user.documentId,
      };
      store.addAccessToken(token);
      return sendJson(route, 201, { ...token, token: newSecret() });
    },
  },
  {
    method: 'POST',
    pattern: /^\/access-tokens\/([^/]+)\/revoke$/,
    permission: 'api_token:manager',
    handle: (route, { user, params: [id], store }) => {
      const token = store.accessTokens.find((t) => t.documentId === id);
      if (!token) return sendError(route, 404, 'Access token not found');
      const updated: AccessToken = {
        ...token,
        updatedAt: new Date().toISOString(),
        updatedBy: user.documentId,
      };
      store.addAccessToken(updated);
      return sendJson(route, 200, { ...updated, token: newSecret() });
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/access-tokens\/([^/]+)$/,
    permission: 'api_token:manager',
    handle: async (route, { params: [id], store }) => {
      if (!store.accessTokens.some((t) => t.documentId === id)) {
        return sendError(route, 404, 'Access token not found');
      }
      store.removeAccessToken(id);
      await route.fulfill({ status: 204 });
      return 204;
    },
  },
];

/** The routes the fake settings backend models. Anything else under its prefixes answers 404. */
export const SETTINGS_ROUTES: SettingsRoute[] = [
  ...USERS_ROUTES,
  ...ROLES_ROUTES,
  ...PERMISSIONS_ROUTES,
  ...ACCESS_TOKENS_ROUTES,
];

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
    removeRole: (documentId) => {
      const index = roles.findIndex((r) => r.documentId === documentId);
      if (index !== -1) roles.splice(index, 1);
    },
    addPermission: (permission) => upsert(permissions, permission),
    removePermission: (documentId) => {
      const index = permissions.findIndex((p) => p.documentId === documentId);
      if (index !== -1) permissions.splice(index, 1);
    },
    addAccessToken: (token) => upsert(accessTokens, token),
    removeAccessToken: (documentId) => {
      const index = accessTokens.findIndex((t) => t.documentId === documentId);
      if (index !== -1) accessTokens.splice(index, 1);
    },
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
