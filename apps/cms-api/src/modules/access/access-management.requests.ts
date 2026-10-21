import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { EMAIL_MAX_LENGTH } from '../../common/constants/auth.constants';
import { SLUG_PATTERN } from '../content-engine/content-engine.constants';
import { CUSTOM_ROLE_RANK } from '../identity/identity.constants';
import {
  MANAGEMENT_ERROR_CODES,
  MANAGEMENT_ERROR_MESSAGES,
  MANAGEMENT_LIMITS,
  PAGINATION,
} from './access-management.constants';

/** `:id` of /accounts and /roles: always a `document_id` (T17 Q5). */
export const documentIdSchema = z.uuid();

const DIGITS = /^\d{1,9}$/;

/** A query-string integer: digits only, so `1.5`, `-1` and `1e2` fail. */
function queryInt(min: number, max: number, fallback: number) {
  return z
    .string()
    .regex(DIGITS)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max))
    .optional()
    .transform((value) => value ?? fallback);
}

/** `?page=&pageSize=` of a paginated list (Q10); nothing else is accepted (Q12). */
export const pageQuerySchema = z.strictObject({
  page: queryInt(
    PAGINATION.FIRST_PAGE,
    Number.MAX_SAFE_INTEGER,
    PAGINATION.FIRST_PAGE,
  ),
  pageSize: queryInt(1, PAGINATION.MAX_PAGE_SIZE, PAGINATION.DEFAULT_PAGE_SIZE),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

/** `meta` of a paginated list; `total` counts every row, not just the page. */
export interface PageMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

const displayName = z
  .string()
  .trim()
  .min(1)
  .max(MANAGEMENT_LIMITS.DISPLAY_NAME_MAX_LENGTH);

/** `POST /accounts`: invite-only (Q2), the invitee sets the password. */
export const inviteAccountSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).pipe(z.email()),
  displayName,
  /** The role's `document_id`. */
  roleId: documentIdSchema,
});

/** `PATCH /accounts/:id`: display name and role only, never the email (T17 Q2). */
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
    .regex(SLUG_PATTERN),
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

/** Where the request is wrong: paths and messages, never the submitted values. */
export interface RequestIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export function invalidRequest(
  issues: readonly RequestIssue[],
): BadRequestException {
  return new BadRequestException({
    errorCode: MANAGEMENT_ERROR_CODES.INVALID_REQUEST,
    message: MANAGEMENT_ERROR_MESSAGES.INVALID_REQUEST,
    details: {
      issues: issues.map((issue) => ({
        path: issue.path.map(String),
        message: issue.message,
      })),
    },
  });
}

/** Parses a body or param; 400 ACCESS_INVALID_REQUEST with the issue paths. */
export function parseRequest<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalidRequest(parsed.error.issues);
  return parsed.data;
}
