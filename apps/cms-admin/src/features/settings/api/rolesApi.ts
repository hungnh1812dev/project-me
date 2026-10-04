import { cmsApi } from '@/core/api/CmsApi';
import type { Role } from '@/features/auth/types';

// Pure request functions for the roles endpoints (SPEC R1–R4). Every id in a path is encoded.
// Errors reject as the `ApiError` the `cmsApi` interceptor built.

const rolePath = (id: string) => `/roles/${encodeURIComponent(id)}`;

/** R2's body. */
export interface CreateRoleInput {
  name: string;
  slug: string;
  permissions: string[];
  level: number;
}

/** R3's body: only the changed fields (AC-20). */
export type UpdateRoleInput = Partial<Pick<CreateRoleInput, 'name' | 'permissions' | 'level'>>;

/** R1 `GET /roles`: every role. */
export async function getRoles(signal?: AbortSignal): Promise<Role[]> {
  const { data } = await cmsApi.get<Role[]>('/roles', { signal });
  return data;
}

/** R2 `POST /roles`: creates a role (400 unknown slug, 409 slug exists). */
export async function createRole(input: CreateRoleInput): Promise<Role> {
  const { data } = await cmsApi.post<Role>('/roles', input);
  return data;
}

/** R3 `PUT /roles/:id`: changes the given fields (400 for a default role's name or level). */
export async function updateRole(id: string, changes: UpdateRoleInput): Promise<Role> {
  const { data } = await cmsApi.put<Role>(rolePath(id), changes);
  return data;
}

/** R4 `DELETE /roles/:id`: deletes it (204), 400 for a default role, 409 while it is assigned. */
export async function deleteRole(id: string): Promise<void> {
  await cmsApi.delete(rolePath(id));
}
