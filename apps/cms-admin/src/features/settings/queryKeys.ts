const ROOT = 'settings';

/**
 * The React Query key factory for the settings pages (AC-11). Every key starts with `['settings']`
 * and each list has one key, which its mutations invalidate. Build settings keys only through this
 * factory.
 */
export const settingsKeys = {
  /** `['settings']`: everything this feature caches. */
  all: [ROOT] as const,
  /** `['settings', 'users']`: U1. */
  users: () => [ROOT, 'users'] as const,
  /** `['settings', 'roles']`: R1. */
  roles: () => [ROOT, 'roles'] as const,
  /** `['settings', 'permissions']`: P1. */
  permissions: () => [ROOT, 'permissions'] as const,
  /** `['settings', 'accessTokens']`: T1. */
  accessTokens: () => [ROOT, 'accessTokens'] as const,
  /** `['settings', 'media']`: M1. */
  media: () => [ROOT, 'media'] as const,
};
