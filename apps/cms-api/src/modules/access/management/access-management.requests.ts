import { z } from 'zod';

import { EMAIL_MAX_LENGTH } from '../../identity';
import { documentIdSchema } from '../../../common/http/request-parsing';
import { CUSTOM_ROLE_RANK, ROLE_SLUG_PATTERN } from '../roles/system-roles';
import { MANAGEMENT_LIMITS } from './access-management.constants';

const displayName = z
  .string()
  .trim()
  .min(1)
  .max(MANAGEMENT_LIMITS.DISPLAY_NAME_MAX_LENGTH);

/** `POST /accounts`: invite-only, the invitee sets the password. */
export const inviteAccountSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email()),
  displayName,
  /** The role's `document_id`. */
  roleId: documentIdSchema,
});

/** `PATCH /accounts/:id`: display name and role only, never the email. */
export const updateAccountSchema = z
  .strictObject({
    displayName: displayName.optional(),
    roleId: documentIdSchema.optional(),
  })
  .refine(
    (body) => body.displayName !== undefined || body.roleId !== undefined,
  );

const customRank = z
  .number()
  .int()
  .min(CUSTOM_ROLE_RANK.min)
  .max(CUSTOM_ROLE_RANK.max);

const roleName = z
  .string()
  .trim()
  .min(1)
  .max(MANAGEMENT_LIMITS.ROLE_NAME_MAX_LENGTH);

/** `POST /roles`: custom roles only (rank 11–39, SPEC §6). */
export const createRoleSchema = z.strictObject({
  slug: z
    .string()
    .max(MANAGEMENT_LIMITS.ROLE_SLUG_MAX_LENGTH)
    .regex(ROLE_SLUG_PATTERN),
  name: roleName,
  rank: customRank,
});

/** `PATCH /roles/:id`: the slug is immutable for every role. */
export const updateRoleSchema = z
  .strictObject({ name: roleName.optional(), rank: customRank.optional() })
  .refine((body) => body.name !== undefined || body.rank !== undefined);

/** `PUT /roles/:id/permissions`: rows are checked by validatePermissionSet. */
export const replacePermissionsSchema = z.strictObject({
  permissions: z
    .array(z.unknown())
    .max(MANAGEMENT_LIMITS.MAX_PERMISSIONS_PER_ROLE),
});

export type InviteAccountRequest = z.infer<typeof inviteAccountSchema>;
export type UpdateAccountRequest = z.infer<typeof updateAccountSchema>;
export type CreateRoleRequest = z.infer<typeof createRoleSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleSchema>;
