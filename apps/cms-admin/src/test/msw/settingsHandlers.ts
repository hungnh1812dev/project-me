import { http, HttpResponse, type RequestHandler } from 'msw';

import {
  makeAccessToken,
  makeAccessTokenSecret,
  makeMediaAsset,
  makePermission,
  makeRole,
  makeUser,
} from '@/test/fixtures';

// Opt-in handlers for the settings endpoints (SPEC U1–U4, R1–R4, P1–P4, T1–T4, M1–M3). They are
// NOT part of the global defaults: a test installs the ones it needs with `server.use(r.handler)`,
// so a stray call still fails under `onUnhandledRequest: 'error'`. Each recorder keeps the
// requests it served, in order.

/** One request a settings handler served. */
export interface SettingsRequest {
  method: string;
  url: URL;
  /** Path params as MSW decoded them, e.g. `{ id }`. */
  params: Record<string, string>;
  /** The request's `Content-Type` header, or `null`. */
  contentType: string | null;
  /**
   * Parsed JSON, the raw text of a multipart body (read its file part with `multipartFile`), or
   * undefined when there was none.
   */
  body: unknown;
}

/** Builds the response for a recorded request. */
export type SettingsReply = (request: SettingsRequest) => Response | Promise<Response>;

/** An installable MSW handler plus the requests it has served. */
export interface SettingsHandler {
  handler: RequestHandler;
  requests: SettingsRequest[];
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const BASE = '*/api/v1';

async function readBody(request: Request, contentType: string | null): Promise<unknown> {
  const text = await request.text();
  if (contentType?.startsWith('multipart/form-data')) return text;
  return text ? (JSON.parse(text) as unknown) : undefined;
}

/** The `field` file part of a raw multipart body: its file name, type and size in bytes. */
export function multipartFile(
  body: unknown,
  field = 'file',
): { name: string; type: string; size: number } | null {
  if (typeof body !== 'string') return null;
  for (const part of body.split(/\r?\n--/)) {
    const [head = '', ...rest] = part.split(/\r?\n\r?\n/);
    const name = /filename="([^"]*)"/.exec(head)?.[1];
    if (!head.includes(`name="${field}"`) || name === undefined) continue;
    const content = rest.join('\r\n\r\n').replace(/\r?\n$/, '');
    return {
      name,
      type: /content-type:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim() ?? '',
      size: new TextEncoder().encode(content).length,
    };
  }
  return null;
}

function toParams(params: Record<string, string | readonly string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function recorder(method: Method, path: string, fallback: SettingsReply) {
  return (reply: SettingsReply = fallback): SettingsHandler => {
    const requests: SettingsRequest[] = [];
    const handler = http[method](`${BASE}${path}`, async ({ request, params }) => {
      const contentType = request.headers.get('content-type');
      const recorded: SettingsRequest = {
        method: request.method,
        url: new URL(request.url),
        params: toParams(params),
        contentType,
        body: await readBody(request, contentType),
      };
      requests.push(recorded);
      return reply(recorded);
    });
    return { handler, requests };
  };
}

function bodyObject(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

const noContent = () => new HttpResponse(null, { status: 204 });

/** A Nest-style error response, for custom replies. */
export function settingsErrorReply(status: number, message = 'Error'): SettingsReply {
  return () => HttpResponse.json({ statusCode: status, message }, { status });
}

// Users

/** U1 `GET /users`. Default: two users. */
export const listUsersHandler = recorder('get', '/users', () =>
  HttpResponse.json([
    makeUser({ documentId: 'user-1', email: 'jane@example.com', name: 'Jane Doe' }),
    makeUser(),
  ]),
);

/** U2 `PUT /users/:id`. Default: the user with the sent fields applied. */
export const updateUserHandler = recorder('put', '/users/:id', ({ params, body }) =>
  HttpResponse.json(makeUser({ documentId: params.id, ...bodyObject(body) })),
);

/** U3 `PATCH /users/:id/role`. Default: the user with the new `roleId`. */
export const updateUserRoleHandler = recorder('patch', '/users/:id/role', ({ params, body }) =>
  HttpResponse.json(
    makeUser({ documentId: params.id, roleId: bodyObject(body).roleId as string | null }),
  ),
);

/** U4 `DELETE /users/:id`. Default: 204. */
export const deleteUserHandler = recorder('delete', '/users/:id', noContent);

// Roles

/** R1 `GET /roles`. Default: the seeded admin and editor roles. */
export const listRolesHandler = recorder('get', '/roles', () =>
  HttpResponse.json([
    makeRole({
      documentId: 'role-admin',
      name: 'Admin',
      slug: 'admin',
      level: 50,
      isDefault: true,
    }),
    makeRole(),
  ]),
);

/** R2 `POST /roles`. Default: 201 with the sent fields. */
export const createRoleHandler = recorder('post', '/roles', ({ body }) =>
  HttpResponse.json(makeRole({ documentId: 'role-new', ...bodyObject(body) }), { status: 201 }),
);

/** R3 `PUT /roles/:id`. Default: the role with the sent fields applied. */
export const updateRoleHandler = recorder('put', '/roles/:id', ({ params, body }) =>
  HttpResponse.json(makeRole({ documentId: params.id, ...bodyObject(body) })),
);

/** R4 `DELETE /roles/:id`. Default: 204. */
export const deleteRoleHandler = recorder('delete', '/roles/:id', noContent);

// Permissions

/** P1 `GET /permissions`. Default: a global and a scoped document permission plus `role:read`. */
export const listPermissionsHandler = recorder('get', '/permissions', () =>
  HttpResponse.json([
    makePermission({ documentId: 'perm-doc-read', slug: 'document:read', name: 'Read documents' }),
    makePermission({
      documentId: 'perm-doc-read-article',
      slug: 'document:read:article',
      name: 'Read article documents',
    }),
    makePermission(),
  ]),
);

/** P2 `POST /permissions`. Default: 201 with the sent fields. */
export const createPermissionHandler = recorder('post', '/permissions', ({ body }) =>
  HttpResponse.json(makePermission({ documentId: 'perm-new', ...bodyObject(body) }), {
    status: 201,
  }),
);

/** P3 `PUT /permissions/:id`. Default: the permission with the sent fields applied. */
export const updatePermissionHandler = recorder('put', '/permissions/:id', ({ params, body }) =>
  HttpResponse.json(makePermission({ documentId: params.id, ...bodyObject(body) })),
);

/** P4 `DELETE /permissions/:id`. Default: 204. */
export const deletePermissionHandler = recorder('delete', '/permissions/:id', noContent);

// Access tokens

/** T1 `GET /access-tokens`. Default: an expiring and a never-expiring token, no secrets. */
export const listAccessTokensHandler = recorder('get', '/access-tokens', () =>
  HttpResponse.json([
    makeAccessToken(),
    makeAccessToken({ documentId: 'tok-2', name: 'Preview', expiresAt: null }),
  ]),
);

/** T2 `POST /access-tokens`. Default: 201 with the sent fields and a one-time `token`. */
export const createAccessTokenHandler = recorder('post', '/access-tokens', ({ body }) => {
  const { name, permissions } = bodyObject(body);
  return HttpResponse.json(
    makeAccessTokenSecret({
      documentId: 'tok-new',
      ...(typeof name === 'string' && { name }),
      ...(Array.isArray(permissions) && { permissions: permissions as string[] }),
    }),
    { status: 201 },
  );
});

/** T3 `POST /access-tokens/:id/revoke`. Default: the token with a rotated `token`. */
export const revokeAccessTokenHandler = recorder(
  'post',
  '/access-tokens/:id/revoke',
  ({ params }) =>
    HttpResponse.json(
      makeAccessTokenSecret({ documentId: params.id, token: 'cms_secret_rotated' }),
    ),
);

/** T4 `DELETE /access-tokens/:id`. Default: 204. */
export const deleteAccessTokenHandler = recorder('delete', '/access-tokens/:id', noContent);

// Media

/** M1 `GET /media`. Default: two assets, newest first. */
export const listMediaHandler = recorder('get', '/media', () =>
  HttpResponse.json([
    makeMediaAsset({
      documentId: 'media-2',
      fileName: 'dog.jpg',
      mimeType: 'image/jpeg',
      createdAt: '2026-01-02T00:00:00.000Z',
    }),
    makeMediaAsset(),
  ]),
);

/** M2 `POST /media/upload`. Default: 201 with the uploaded file's name and type. */
export const uploadMediaHandler = recorder('post', '/media/upload', ({ body }) => {
  const file = multipartFile(body);
  return HttpResponse.json(
    makeMediaAsset({
      documentId: 'media-new',
      ...(file && { fileName: file.name, mimeType: file.type, size: file.size }),
    }),
    { status: 201 },
  );
});

/** M3 `DELETE /media/:id`. Default: 204. */
export const deleteMediaHandler = recorder('delete', '/media/:id', noContent);
