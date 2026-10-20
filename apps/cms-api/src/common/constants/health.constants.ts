export const HEALTH_STATUS = {
  OK: 'ok',
  ERROR: 'error',
} as const;

export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];

/** Upper bound for the readiness DB ping, so probes never hang. */
export const READINESS_DB_TIMEOUT_MS = 2_000;
