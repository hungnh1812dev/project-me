import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { server } from '@/test/msw/server';
import {
  createRoleHandler,
  deleteRoleHandler,
  settingsErrorReply,
  updateRoleHandler,
} from '@/test/msw/settingsHandlers';

import { createRole, deleteRole, updateRole } from './rolesApi';

const INPUT = { name: 'Writer', slug: 'writer', permissions: ['document:read'], level: 10 };

describe('createRole (R2)', () => {
  it('POSTs /roles with { name, slug, permissions, level } and resolves with the role', async () => {
    const r2 = createRoleHandler();
    server.use(r2.handler);

    const role = await createRole(INPUT);

    expect(role).toMatchObject({ documentId: 'role-new', ...INPUT });
    expect(r2.requests[0]).toMatchObject({ method: 'POST', body: INPUT });
    expect(r2.requests[0]?.url.pathname).toBe('/api/v1/roles');
  });

  it('rejects a 409 as an ApiError', async () => {
    server.use(createRoleHandler(settingsErrorReply(409, 'Slug exists')).handler);

    const error = await createRole(INPUT).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, message: 'Slug exists' });
  });
});

describe('updateRole (R3)', () => {
  it('PUTs /roles/:id with only the given fields, encoding the id', async () => {
    const r3 = updateRoleHandler();
    server.use(r3.handler);

    await updateRole('role/1 x', { permissions: ['role:read'] });

    expect(r3.requests[0]).toMatchObject({ method: 'PUT', body: { permissions: ['role:read'] } });
    expect(r3.requests[0]?.url.pathname).toBe('/api/v1/roles/role%2F1%20x');
  });

  it('rejects a 400 as an ApiError', async () => {
    server.use(updateRoleHandler(settingsErrorReply(400, 'Default role')).handler);

    await expect(updateRole('role-admin', { level: 1 })).rejects.toMatchObject({ status: 400 });
  });
});

describe('deleteRole (R4)', () => {
  it('DELETEs /roles/:id, encoding the id', async () => {
    const r4 = deleteRoleHandler();
    server.use(r4.handler);

    await expect(deleteRole('role/2')).resolves.toBeUndefined();
    expect(r4.requests[0]?.method).toBe('DELETE');
    expect(r4.requests[0]?.url.pathname).toBe('/api/v1/roles/role%2F2');
  });

  it('rejects a 409 as an ApiError', async () => {
    server.use(deleteRoleHandler(settingsErrorReply(409, 'Role in use')).handler);

    await expect(deleteRole('role-1')).rejects.toMatchObject({ status: 409 });
  });
});
