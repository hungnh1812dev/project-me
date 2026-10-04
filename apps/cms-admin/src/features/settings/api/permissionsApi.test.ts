import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { server } from '@/test/msw/server';
import {
  createPermissionHandler,
  deletePermissionHandler,
  listPermissionsHandler,
  settingsErrorReply,
  updatePermissionHandler,
} from '@/test/msw/settingsHandlers';

import {
  createPermission,
  deletePermission,
  getPermissions,
  updatePermission,
} from './permissionsApi';

describe('getPermissions (P1)', () => {
  it('GETs /permissions and resolves with the catalog', async () => {
    const p1 = listPermissionsHandler();
    server.use(p1.handler);

    const permissions = await getPermissions();

    expect(permissions.map((p) => p.slug)).toEqual([
      'document:read',
      'document:read:article',
      'role:read',
    ]);
    expect(p1.requests[0]?.url.pathname).toBe('/api/v1/permissions');
  });

  it('rejects a server 403 as an ApiError', async () => {
    server.use(listPermissionsHandler(settingsErrorReply(403, 'Forbidden resource')).handler);

    const error = await getPermissions().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403 });
  });
});

describe('createPermission (P2)', () => {
  const INPUT = { slug: 'article:export', name: 'Export articles', description: 'As CSV.' };

  it('POSTs exactly { slug, name, description }', async () => {
    const p2 = createPermissionHandler();
    server.use(p2.handler);

    await expect(createPermission(INPUT)).resolves.toMatchObject(INPUT);
    expect(p2.requests[0]).toMatchObject({ method: 'POST', body: INPUT });
    expect(p2.requests[0]?.url.pathname).toBe('/api/v1/permissions');
  });

  it('rejects a duplicate slug as a 409 ApiError', async () => {
    server.use(createPermissionHandler(settingsErrorReply(409, 'Slug exists')).handler);

    await expect(createPermission(INPUT)).rejects.toMatchObject({ status: 409 });
  });
});

describe('updatePermission (P3)', () => {
  it('PUTs only the given fields to an encoded path', async () => {
    const p3 = updatePermissionHandler();
    server.use(p3.handler);

    await expect(updatePermission('perm/1', { name: 'New name' })).resolves.toMatchObject({
      name: 'New name',
    });
    expect(p3.requests[0]).toMatchObject({ method: 'PUT', body: { name: 'New name' } });
    expect(p3.requests[0]?.url.pathname).toBe('/api/v1/permissions/perm%2F1');
  });
});

describe('deletePermission (P4)', () => {
  it('DELETEs /permissions/:id with an encoded id', async () => {
    const p4 = deletePermissionHandler();
    server.use(p4.handler);

    await expect(deletePermission('perm 1')).resolves.toBeUndefined();
    expect(p4.requests[0]?.method).toBe('DELETE');
    expect(p4.requests[0]?.url.pathname).toBe('/api/v1/permissions/perm%201');
  });

  it('rejects a 409 and keeps the conflict body', async () => {
    const body = { statusCode: 409, message: 'In use', roleCount: 2, accessTokenCount: 1 };
    server.use(deletePermissionHandler(() => HttpResponse.json(body, { status: 409 })).handler);

    await expect(deletePermission('perm-1')).rejects.toMatchObject({ status: 409, body });
  });
});
