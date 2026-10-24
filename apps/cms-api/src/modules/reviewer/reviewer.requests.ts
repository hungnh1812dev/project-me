import { z } from 'zod';

import { TURNSTILE_TOKEN_MAX_LENGTH } from '../../infrastructure/turnstile/turnstile.port';
import { REVIEWER_INPUT_LIMITS } from './reviewer.constants';

const TAB = 9;
const NEWLINE = 10;
const SPACE = 32;
const DELETE = 127;

/** Plain text: no control characters other than tab and newline. */
function isPlainText(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? SPACE;
    if (code === TAB || code === NEWLINE) continue;
    if (code < SPACE || code === DELETE) return false;
  }
  return true;
}

const label = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => isPlainText(value) && !value.includes('\n'), {
      message: 'must be a single line of plain text',
    });

/** `POST /reviewer/sessions`. Strict: unknown keys are rejected. */
export const createReviewerSessionSchema = z.strictObject({
  visitorRole: label(REVIEWER_INPUT_LIMITS.VISITOR_ROLE_MAX_LENGTH),
  purposeTags: z
    .array(label(REVIEWER_INPUT_LIMITS.PURPOSE_TAG_MAX_LENGTH))
    .max(REVIEWER_INPUT_LIMITS.PURPOSE_TAGS_MAX)
    .default([]),
  notes: z
    .string()
    .trim()
    .max(REVIEWER_INPUT_LIMITS.NOTES_MAX_LENGTH)
    .refine(isPlainText, { message: 'must be plain text' })
    .optional(),
  turnstileToken: z.string().min(1).max(TURNSTILE_TOKEN_MAX_LENGTH),
});

export type CreateReviewerSessionRequest = z.infer<
  typeof createReviewerSessionSchema
>;

/** `PUT /reviewer/settings`. */
export const reviewerSettingsSchema = z.strictObject({
  enabled: z.boolean(),
});

export type ReviewerSettingsRequest = z.infer<typeof reviewerSettingsSchema>;
