import { expect, test } from './fixtures/mockApi.ts';

test('loads the app shell with the API mocked', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/');

  await expect(page.locator('#root')).not.toBeEmpty();
  expect(pageErrors).toEqual([]);
});

test('answers /api/v1 calls from the mock, not a real backend', async ({ page, mockApi }) => {
  await page.goto('/');

  const status = await page.evaluate(async () => {
    const res = await fetch('/api/v1/not-a-route');
    return res.status;
  });

  expect(status).toBe(404);
  expect(mockApi.requests).toContainEqual({
    method: 'GET',
    path: '/api/v1/not-a-route',
    status: 404,
  });
});
