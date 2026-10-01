import { cmsApi } from '@/core/api/CmsApi';
import type { Role } from '@/features/auth/types';

// Pure request functions for the roles endpoints (SPEC R1; R2–R4 arrive with the Roles page).
// Errors reject as the `ApiError` the `cmsApi` interceptor built.

/** R1 `GET /roles`: every role. */
export async function getRoles(signal?: AbortSignal): Promise<Role[]> {
  const { data } = await cmsApi.get<Role[]>('/roles', { signal });
  return data;
}
