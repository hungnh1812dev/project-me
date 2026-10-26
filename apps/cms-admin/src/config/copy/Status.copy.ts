export const PAGE_COPY = {
  title: 'System status',
  description:
    'The admin console is not ready yet. This page confirms it can reach the content API from the admin domain.',
} as const;

export const STATUS_COPY = {
  cardTitle: 'Content API',
  cardDescription:
    'Liveness check on the API the admin console manages content through.',
  endpointLabel: 'Endpoint',
  lastCheckedLabel: 'Last checked',
  notCheckedYet: 'Not checked yet',
  state: {
    checking: 'Checking',
    ok: 'Operational',
    error: 'Unreachable',
  },
  errorHint:
    'The API did not respond. Check that cms-api is running and reachable through the proxy, then check again.',
  checkAgain: 'Check again',
} as const;
