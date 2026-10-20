/** User-facing text. One place until an i18n module exists. */
export const COPY = {
  app: {
    name: 'Abyss',
  },
  page: {
    title: 'System status',
    description:
      'The public site is not live yet. This page confirms the site can reach the content API through the same domain.',
  },
  status: {
    cardTitle: 'Content API',
    cardDescription: 'Liveness check on the API this site loads content from.',
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
  },
} as const;
