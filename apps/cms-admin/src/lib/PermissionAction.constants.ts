/** Every permission action, in the server's enum order (matrix columns). */
export const PERMISSION_ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'publish',
  'unpublish',
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
