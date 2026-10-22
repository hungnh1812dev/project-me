import { createHash, timingSafeEqual } from 'node:crypto';

import {
  SETUP_TOKEN_DIGEST_ALGORITHM,
  SETUP_TOKEN_MAX_LENGTH,
} from './identity.constants';

function digestOf(value: string): Buffer {
  return createHash(SETUP_TOKEN_DIGEST_ALGORITHM)
    .update(value, 'utf8')
    .digest();
}

/**
 * True when `submitted` is the configured setup token (ADR 0005). Both sides
 * are hashed first, so the two buffers have equal length and the comparison
 * does not depend on where they differ. Anything that is not a string, or is
 * longer than `SETUP_TOKEN_MAX_LENGTH`, is simply wrong. Pure: no logging.
 */
export function isSetupTokenValid(
  submitted: unknown,
  configured: string,
): boolean {
  if (typeof submitted !== 'string') return false;
  if (submitted.length > SETUP_TOKEN_MAX_LENGTH) return false;
  return timingSafeEqual(digestOf(submitted), digestOf(configured));
}
