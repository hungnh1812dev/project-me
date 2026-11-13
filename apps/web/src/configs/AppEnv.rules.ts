/** The stack the app runs on (WEB-9). `NODE_ENV` is `production` on every built app, so this is the one key that tells stacks apart. */
export const APP_ENVS = ['development', 'staging', 'production'] as const;

export type AppEnv = (typeof APP_ENVS)[number];

/** Build constant `next.config.ts` inlines from APP_ENV; a different name keeps the runtime key APP_ENV live. */
export const APP_ENV_BUILD_KEY = 'APP_ENV_BUILD';

/** Plain imports only: `next.config.ts` loads this file before the `@/` alias exists. */
export function parseAppEnv(raw: string | undefined): AppEnv {
  const value = raw?.trim() ?? '';
  if (value === '') {
    throw new Error('APP_ENV is not set. See .env.example.');
  }
  const appEnv = APP_ENVS.find((candidate) => candidate === value);
  if (appEnv === undefined) {
    throw new Error(`APP_ENV must be one of ${APP_ENVS.join(', ')}.`);
  }
  return appEnv;
}

/** The runtime value must equal the value the image was built with, else the build's mock switch would lie. */
export function assertAppEnvMatchesBuild(runtime: AppEnv, build: string | undefined): void {
  if (build !== runtime) {
    throw new Error('APP_ENV at runtime must equal the APP_ENV the app was built with.');
  }
}
