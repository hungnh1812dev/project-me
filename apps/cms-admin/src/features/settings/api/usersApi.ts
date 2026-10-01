import { cmsApi } from '@/core/api/CmsApi';

import type { User } from '../types';

// Pure request functions for the users endpoints (SPEC U1, U3, U4). Every id in a path is encoded.
// Errors reject as the `ApiError` the `cmsApi` interceptor built. U2 (`PUT /users/:id`) belongs to
// the profile slice and never sends `password`.

const userPath = (id: string) => `/users/${encodeURIComponent(id)}`;

/** U1 `GET /users`: every user. */
export async function getUsers(signal?: AbortSignal): Promise<User[]> {
  const { data } = await cmsApi.get<User[]>('/users', { signal });
  return data;
}

/** U3 `PATCH /users/:id/role`: assigns `roleId` to the user. */
export async function assignUserRole(id: string, roleId: string): Promise<User> {
  const { data } = await cmsApi.patch<User>(`${userPath(id)}/role`, { roleId });
  return data;
}

/** U4 `DELETE /users/:id`: deletes the user (204). */
export async function deleteUser(id: string): Promise<void> {
  await cmsApi.delete(userPath(id));
}
