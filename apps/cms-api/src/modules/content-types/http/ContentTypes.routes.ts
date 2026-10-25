/** SPEC §9 content types, read-only. `:slug` is a registry slug. */
export const CONTENT_TYPES_ROUTES = {
  ROOT: 'content-types',
  BY_SLUG: ':slug',
} as const;
