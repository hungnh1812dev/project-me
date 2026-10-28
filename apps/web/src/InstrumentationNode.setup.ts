import { getServerEnv } from './config/Server.env';

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
