import { describe, expect, it } from 'vitest';

import { ApiError } from '@/core/api/apiError';
import { makeRole, makeUser } from '@/test/fixtures';
import { server } from '@/test/msw/server';
import {
  deleteUserHandler,
  listRolesHandler,
  listUsersHandler,
  settingsErrorReply,
  updateUserRoleHandler,
} from '@/test/msw/settingsHandlers';

import { getRoles } from './rolesApi';
import { assignUserRole, deleteUser, getUsers } from './usersApi';

describe('getUsers (U1)', () => {
  it('GETs /users and resolves with the users', async () => {
    const u1 = listUsersHandler();
    server.use(u1.handler);

    await expect(getUsers()).resolves.toEqual([
      makeUser({ documentId: 'user-1', email: 'jane@example.com', name: 'Jane Doe' }),
      makeUser(),
    ]);
    expect(u1.requests).toHaveLength(1);
    expect(u1.requests[0]?.url.pathname).toBe('/api/v1/users');
  });

  it('rejects a server 403 as an ApiError', async () => {
    server.use(listUsersHandler(settingsErrorReply(403, 'Forbidden resource')).handler);

    const error = await getUsers().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, message: 'Forbidden resource' });
  });
});

describe('assignUserRole (U3)', () => {
  it('PATCHes /users/:id/role with exactly { roleId }', async () => {
    const u3 = updateUserRoleHandler();
    server.use(u3.handler);

    await expect(assignUserRole('user-2', 'role-guest')).resolves.toEqual(
      makeUser({ documentId: 'user-2', roleId: 'role-guest' }),
    );
    expect(u3.requests[0]).toMatchObject({ method: 'PATCH', body: { roleId: 'role-guest' } });
    expect(u3.requests[0]?.url.pathname).toBe('/api/v1/users/user-2/role');
  });

  it('encodes the id in the path', async () => {
    const u3 = updateUserRoleHandler();
    server.use(u3.handler);

    await assignUserRole('a/b?c', 'role-guest');

    expect(u3.requests[0]?.url.pathname).toBe('/api/v1/users/a%2Fb%3Fc/role');
  });

  it('rejects a hierarchy 403 with the server message', async () => {
    server.use(updateUserRoleHandler(settingsErrorReply(403, 'Role level too high')).handler);

    await expect(assignUserRole('user-2', 'role-admin')).rejects.toMatchObject({
      status: 403,
      message: 'Role level too high',
    });
  });
});

describe('deleteUser (U4)', () => {
  it('DELETEs /users/:id with an encoded id', async () => {
    const u4 = deleteUserHandler();
    server.use(u4.handler);

    await expect(deleteUser('user 2')).resolves.toBeUndefined();
    expect(u4.requests[0]?.method).toBe('DELETE');
    expect(u4.requests[0]?.url.pathname).toBe('/api/v1/users/user%202');
  });

  it('rejects a 404 as an ApiError', async () => {
    server.use(deleteUserHandler(settingsErrorReply(404, 'User not found')).handler);

    await expect(deleteUser('missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('getRoles (R1)', () => {
  it('GETs /roles and resolves with the roles', async () => {
    const r1 = listRolesHandler();
    server.use(r1.handler);

    const roles = await getRoles();

    expect(roles).toHaveLength(2);
    expect(roles[1]).toEqual(makeRole());
    expect(r1.requests[0]?.url.pathname).toBe('/api/v1/roles');
  });
});
