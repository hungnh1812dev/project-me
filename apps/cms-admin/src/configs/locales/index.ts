import { use } from 'react';

import { APP_COPY, COMMON_COPY, NAV_COPY, PASSWORD_COPY, SESSION_COPY } from './en/Common';

export type Locale = 'en';
export const DEFAULT_LOCALE: Locale = 'en';

/** One screen = one section file under `en/`; `Common` is not a screen (see COMMON_TEXT). */
const EN_LOADERS = {
  access: () => import('./en/Access').then(({ ACCESS_COPY }) => ({ access: ACCESS_COPY })),
  backups: () => import('./en/Backups').then(({ BACKUPS_COPY }) => ({ backups: BACKUPS_COPY })),
  content: () => import('./en/Content').then(({ CONTENT_COPY }) => ({ content: CONTENT_COPY })),
  login: () => import('./en/Login').then(({ LOGIN_COPY }) => ({ login: LOGIN_COPY })),
  media: () => import('./en/Media').then(({ MEDIA_COPY }) => ({ media: MEDIA_COPY })),
  reviewer: () =>
    import('./en/Reviewer').then(({ REVIEWER_COPY }) => ({ reviewer: REVIEWER_COPY })),
  security: () =>
    import('./en/Security').then(({ SECURITY_COPY }) => ({ security: SECURITY_COPY })),
  setup: () => import('./en/Setup').then(({ SETUP_COPY }) => ({ setup: SETUP_COPY })),
  status: () =>
    import('./en/Status').then(({ PAGE_COPY, STATUS_COPY }) => ({
      page: PAGE_COPY,
      status: STATUS_COPY,
    })),
} as const;

const LOADERS_BY_LOCALE = { en: EN_LOADERS } as const;

export type ScreenName = keyof typeof EN_LOADERS;
export type ScreenText<S extends ScreenName> = Awaited<ReturnType<(typeof EN_LOADERS)[S]>>;

/** Text the shell needs on every screen and at module scope; part of the entry chunk. */
export const COMMON_TEXT = {
  common: COMMON_COPY,
  app: APP_COPY,
  session: SESSION_COPY,
  password: PASSWORD_COPY,
  nav: NAV_COPY,
} as const;

type SettledPromise<T> = Promise<T> &
  (
    | { status?: undefined }
    | { status: 'fulfilled'; value: T }
    | { status: 'rejected'; reason: unknown }
  );

const cache = new Map<string, SettledPromise<unknown>>();

const toCacheKey = (locale: Locale, screen: ScreenName) => `${locale}:${screen}`;

/** Loads one screen's text once per locale; a failed load stays cached until `retryFailedScreenText`. */
export const loadScreenText = <S extends ScreenName>(
  screen: S,
  locale: Locale = DEFAULT_LOCALE,
): Promise<ScreenText<S>> => {
  const key = toCacheKey(locale, screen);
  const cached = cache.get(key);
  if (cached) return cached as Promise<ScreenText<S>>;

  const loader = LOADERS_BY_LOCALE[locale][screen] as () => Promise<ScreenText<S>>;
  const promise: SettledPromise<ScreenText<S>> = loader();
  const settled = promise as Promise<ScreenText<S>> & Record<string, unknown>;
  promise.then(
    (value) => {
      settled.status = 'fulfilled';
      settled.value = value;
    },
    (reason: unknown) => {
      settled.status = 'rejected';
      settled.reason = reason;
    },
  );
  cache.set(key, promise);
  return promise;
};

/** Drops the failed loads of these screens so the next `loadScreenText` fetches them again. */
export const retryFailedScreenText = (
  screens: readonly ScreenName[],
  locale: Locale = DEFAULT_LOCALE,
): void => {
  for (const screen of screens) {
    const key = toCacheKey(locale, screen);
    if (cache.get(key)?.status === 'rejected') cache.delete(key);
  }
};

export const preloadScreenText = (
  screens: readonly ScreenName[],
  locale: Locale = DEFAULT_LOCALE,
): Promise<unknown[]> => Promise.all(screens.map((screen) => loadScreenText(screen, locale)));

/**
 * Suspends on the first visit of a screen; returns at once when it is preloaded.
 * A settled load is read directly: `use` on a thenable React did not create still
 * stalls a route change that renders inside a transition (React 19.3.1).
 */
export const useScreenText = <S extends ScreenName>(screen: S): ScreenText<S> => {
  const loading = loadScreenText(screen) as SettledPromise<ScreenText<S>>;
  return loading.status === 'fulfilled' ? loading.value : use(loading);
};
