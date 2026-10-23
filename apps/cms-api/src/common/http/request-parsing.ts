import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/**
 * Offset pagination of list endpoints (Q10): `?page=&pageSize=` in, `meta`
 * out. The project list convention; documents, media and audit logs reuse it.
 */
export const PAGINATION = {
  FIRST_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

/** Body or params fail the request schema; `details.issues` lists paths. */
export const INVALID_REQUEST_ERROR = {
  CODE: 'ACCESS_INVALID_REQUEST',
  MESSAGE: 'The request is invalid.',
} as const;

/** `:id` of /accounts and /roles: always a `document_id` (T17 Q5). */
export const documentIdSchema = z.uuid();

const DIGITS = /^\d{1,9}$/;

/** A query-string integer: digits only, so `1.5`, `-1` and `1e2` fail. */
export function queryInt(min: number, max: number, fallback: number) {
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

/** Where the request is wrong: paths and messages, never the submitted values. */
export interface RequestIssue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export function invalidRequest(
  issues: readonly RequestIssue[],
): BadRequestException {
  return new BadRequestException({
    errorCode: INVALID_REQUEST_ERROR.CODE,
    message: INVALID_REQUEST_ERROR.MESSAGE,
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
