import { test as base, type Page, type Route } from '@playwright/test';

/** One API call the app made, recorded by the mock. */
export interface RecordedRequest {
  method: string;
  path: string;
}

export interface MockApi {
  /** Every `/api/v1/**` request the page made, in order. */
  readonly requests: RecordedRequest[];
}

const API_PATTERN = '**/api/v1/**';

function notMocked(route: Route, method: string, path: string): Promise<void> {
  return route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({
      statusCode: 404,
      message: `Not mocked: ${method} ${path}`,
      error: 'Not Found',
    }),
  });
}

/**
 * Routes all `/api/v1/**` traffic to an in-test fake so no spec reaches a real backend.
 * Skeleton for 1.1: every call is recorded and answered with a Nest-style 404.
 * Small phase 1.5 adds users, roles, the fake refresh-cookie session and has-users.
 */
export async function installMockApi(page: Page): Promise<MockApi> {
  const requests: RecordedRequest[] = [];

  await page.route(API_PATTERN, (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ method: request.method(), path });
    return notMocked(route, request.method(), path);
  });

  return { requests };
}

/** Playwright `test` with the API mocked for every spec that imports it. */
export const test = base.extend<{ mockApi: MockApi }>({
  mockApi: [
    async ({ page }, use) => {
      await use(await installMockApi(page));
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
