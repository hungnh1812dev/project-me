import { z } from 'zod';

import { OWNER_ENV_KEYS } from '../identity.constants';
import { CliInputError } from './password-input';

/** A blank value counts as not set. */
const optionalText = z
  .string()
  .optional()
  .transform((value) =>
    value === undefined || value.trim() === '' ? undefined : value,
  );

const ownerEnvSchema = z.object({
  [OWNER_ENV_KEYS.email]: optionalText,
  [OWNER_ENV_KEYS.displayName]: optionalText,
});

export interface OwnerEnv {
  readonly email: string;
  readonly displayName: string | undefined;
}

/**
 * The only reader of OWNER_EMAIL and OWNER_DISPLAY_NAME. Used by the
 * `owner:bootstrap` CLI; the API's env schema never sees these keys.
 */
export function readOwnerEnv(env: NodeJS.ProcessEnv): OwnerEnv {
  const parsed = ownerEnvSchema.parse(env);
  const email = parsed[OWNER_ENV_KEYS.email];
  if (email === undefined) {
    throw new CliInputError(`${OWNER_ENV_KEYS.email} is required.`);
  }
  return { email, displayName: parsed[OWNER_ENV_KEYS.displayName] };
}
