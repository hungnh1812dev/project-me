import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

import { parseRequest } from '../../../common/http/request-parsing';
import {
  DOCUMENT_ERROR_MESSAGES,
  EXPECTED_VERSION_BODY_KEY,
  VERSION_BODY_KEY,
} from '../documents.constants';
import { INT4_MAX } from '../../content-engine';
import { ERROR_CODES } from '../../../common/constants/error.constants';

const versionSchema = z.int().min(1).max(INT4_MAX);

const updateVersionSchema = z.object({ [VERSION_BODY_KEY]: versionSchema });

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({
      errorCode: ERROR_CODES.BAD_REQUEST,
      message: DOCUMENT_ERROR_MESSAGES.INVALID_BODY,
    });
  }
  return body as Record<string, unknown>;
}

/** `POST` body: the document tree (`{ values?, components? }`); its keys are checked by the write allowlist. */
export function parseCreateBody(body: unknown): Record<string, unknown> {
  return asObject(body);
}

/**
 * `PUT` body: the tree plus the `version` the client edited. `version` is
 * taken out here, so it can never reach the field allowlist or the SQL.
 */
export function parseUpdateBody(body: unknown): {
  version: number;
  tree: Record<string, unknown>;
} {
  const tree = Object.fromEntries(
    Object.entries(asObject(body)).filter(([key]) => key !== VERSION_BODY_KEY),
  );
  const parsed = parseRequest(updateVersionSchema, body);
  return { version: parsed[VERSION_BODY_KEY], tree };
}

const publishBodySchema = z.strictObject({
  [EXPECTED_VERSION_BODY_KEY]: versionSchema,
});

/** `POST .../publish` body: only the draft version being published. */
export function parsePublishBody(body: unknown): number {
  return parseRequest(publishBodySchema, body)[EXPECTED_VERSION_BODY_KEY];
}
