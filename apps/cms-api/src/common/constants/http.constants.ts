/** Header that carries the per-request correlation id, in and out. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Inbound request ids are accepted only if they match this shape. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Express app settings (see https://expressjs.com/en/5x/api.html#app.settings.table). */
export const EXPRESS_SETTINGS = {
  STRICT_ROUTING: 'strict routing',
  TRUST_PROXY: 'trust proxy',
} as const;
