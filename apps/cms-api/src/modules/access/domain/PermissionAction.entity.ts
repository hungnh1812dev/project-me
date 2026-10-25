/** What a permission allows on a subject. Values are stored in permissions.action, token scope JSON and audit metadata, so they stay byte-identical to the database enum. */
export const PermissionAction = {
  read: 'read',
  create: 'create',
  update: 'update',
  delete: 'delete',
  publish: 'publish',
  unpublish: 'unpublish',
} as const;

export type PermissionAction =
  (typeof PermissionAction)[keyof typeof PermissionAction];
