import { getServerEnv } from './config/env.server';

/**
 * Node-runtime start check. An invalid server env exits the process (Next
 * would otherwise keep serving and fail on every request).
 */
export function assertServerEnv(): void {
  try {
    getServerEnv();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
