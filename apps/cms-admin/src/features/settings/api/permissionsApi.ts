import { cmsApi } from '@/core/api/CmsApi';

import type { Permission } from '../types';

// Pure request functions for the permissions endpoints (SPEC P1–P4). Every id in a path is
// encoded. Errors reject as the `ApiError` the `cmsApi` interceptor built; a P4 409 keeps its
// `{ roleCount, accessTokenCount }` body in `error.body` (read it with `parsePermissionConflict`).

const permissionPath = (id: string) => `/permissions/${encodeURIComponent(id)}`;

/** P2's body. */
export interface CreatePermissionInput {
  slug: string;
  name: string;
  description: string;
}

/** P3's body: only the changed fields. */
export type UpdatePermissionInput = Partial<Pick<CreatePermissionInput, 'name' | 'description'>>;

/** P1 `GET /permissions`: the whole catalog. */
export async function getPermissions(signal?: AbortSignal): Promise<Permission[]> {
  const { data } = await cmsApi.get<Permission[]>('/permissions', { signal });
  return data;
}

/** P2 `POST /permissions`: creates a permission (409 when the slug exists). */
export async function createPermission(input: CreatePermissionInput): Promise<Permission> {
  const { data } = await cmsApi.post<Permission>('/permissions', input);
  return data;
}

/** P3 `PUT /permissions/:id`: changes the name and/or description. */
export async function updatePermission(
  id: string,
  changes: UpdatePermissionInput,
): Promise<Permission> {
  const { data } = await cmsApi.put<Permission>(permissionPath(id), changes);
  return data;
}

/** P4 `DELETE /permissions/:id`: deletes it (204), or 409 while roles or tokens still use it. */
export async function deletePermission(id: string): Promise<void> {
  await cmsApi.delete(permissionPath(id));
}
