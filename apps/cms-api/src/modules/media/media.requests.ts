import { z } from 'zod';

import { ALT_MAX_LENGTH } from './media.constants';

/**
 * `PATCH /media/:id`: the alt text only. A blank string or `null` clears it
 * (same rule as the upload's `alt` field); more than 500 characters is 400.
 */
export const updateMediaSchema = z.strictObject({
  alt: z
    .string()
    .trim()
    .refine((value) => Array.from(value).length <= ALT_MAX_LENGTH)
    .transform((value) => (value === '' ? null : value))
    .nullable(),
});

export type UpdateMediaRequest = z.infer<typeof updateMediaSchema>;
