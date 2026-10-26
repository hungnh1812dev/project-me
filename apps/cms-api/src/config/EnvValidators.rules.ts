import { z } from 'zod';

import { MAX_PORT } from './Config.constants';

export const emptyToUndefined = (value: unknown): unknown =>
  value === '' ? undefined : value;

/** Optional non-empty text; an empty string means unset. */
export const optionalText = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

/** Optional secret; length rules for production live in `Env.rules.ts`. */
export const optionalSecret = optionalText;

/** TCP port; empty or missing falls back to `defaultPort`. */
export const portNumber = (defaultPort: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(MAX_PORT).default(defaultPort),
  );
