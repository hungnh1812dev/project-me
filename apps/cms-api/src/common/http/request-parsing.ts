import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { INVALID_REQUEST_ERROR } from '../constants/error.constants';
import {
  documentIdSchema,
  PAGINATION,
  pageQuerySchema,
  queryInt,
  type PageMeta,
  type PageQuery,
  type RequestIssue,
} from '../validation/SharedSchemas.rules';

export {
  INVALID_REQUEST_ERROR,
  documentIdSchema,
  PAGINATION,
  pageQuerySchema,
  queryInt,
  type PageMeta,
  type PageQuery,
  type RequestIssue,
};

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
