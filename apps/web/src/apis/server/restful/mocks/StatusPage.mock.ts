/** Mock answer of the `StatusPage` operation: the text the status page showed before it came from the API. */
export const STATUS_PAGE_MOCK = {
  statusPageText: {
    title: 'System status',
    description: 'This page confirms the site can reach the content API through its own server.',
    cardTitle: 'Content API',
    cardDescription: 'Liveness check on the API this site loads content from.',
    endpointLabel: 'Endpoint',
    lastCheckedLabel: 'Last checked',
    notCheckedYet: 'Not checked yet',
    stateChecking: 'Checking',
    stateOk: 'Operational',
    stateError: 'Unreachable',
    errorHint:
      'The API did not respond. Check that cms-api is running and reachable through the proxy, then check again.',
    checkAgain: 'Check again',
  },
};
