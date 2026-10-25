import { z } from 'zod';

import { API_TOKEN } from '../domain/ApiToken.rules';

const name = z.string().trim().min(1).max(API_TOKEN.NAME_MAX_LENGTH);

/** ISO 8601 with an offset; the service rejects a time in the past. */
const expiresAt = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

/**
 * `POST /api-tokens`. `scope` is checked by validateTokenScope (shape,
 * subjects, fields) and the D5 subset check, not by this schema.
 */
export const createApiTokenSchema = z.strictObject({
  name,
  scope: z.unknown(),
  expiresAt: expiresAt.nullish(),
});

/** `PATCH /api-tokens/:id`; `expiresAt: null` removes the expiry. */
export const updateApiTokenSchema = z
  .strictObject({
    name: name.optional(),
    scope: z.unknown().optional(),
    expiresAt: expiresAt.nullable().optional(),
  })
  .refine(
    (body) =>
      body.name !== undefined ||
      body.scope !== undefined ||
      body.expiresAt !== undefined,
  );

export type CreateApiTokenRequest = z.infer<typeof createApiTokenSchema>;
export type UpdateApiTokenRequest = z.infer<typeof updateApiTokenSchema>;
