import { expect, test } from '@playwright/test';

import { ADMIN_COPY, APP_ROUTES } from '../src/Apps.contract';
import { signInAsOwner } from '../src/Session.fixture';

/** Dev serves `en/Backups.ts`; the production build serves `assets/Backups-<hash>.js`. */
const BACKUPS_TEXT_CHUNK = /\/(en\/Backups\.ts|assets\/Backups-[\w-]+\.js)(\?.*)?$/;

test.describe('admin screen text', { tag: ['@cms-admin', '@cms-api'] }, () => {
  test('a blocked screen text chunk shows the retry state and retry recovers', async ({ page }) => {
    await signInAsOwner(page);
    await page.route(BACKUPS_TEXT_CHUNK, (route) => route.abort('failed'));

    await page.locator(`a[href="${APP_ROUTES.BACKUPS}"]`).first().click();
    await expect(page.getByText(ADMIN_COPY.common.textLoadFailed)).toBeVisible();

    await page.unroute(BACKUPS_TEXT_CHUNK);
    await page.getByRole('button', { name: ADMIN_COPY.common.retry }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: ADMIN_COPY.backups.title }),
    ).toBeVisible();
  });

  test('a first visit loads only the chunks of its own screens', async ({ page }) => {
    const chunks: string[] = [];
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', (req) => {
      const match =
        /\/en\/(\w+)\.ts|\/assets\/(Access|Backups|Content|Login|Media|Reviewer|Security|Setup|Status)-[\w-]+\.js/.exec(
          req.url(),
        );
      if (match) chunks.push((match[1] ?? match[2] ?? '').toLowerCase());
    });
    await signInAsOwner(page);
    chunks.length = 0;
    consoleErrors.length = 0;
    await page.goto(APP_ROUTES.ROLES);
    await expect(
      page.getByRole('heading', { level: 1, name: ADMIN_COPY.access.roles.title }),
    ).toBeVisible();
    expect(consoleErrors).toEqual([]);
    expect(chunks).toContain('access');
    expect(chunks).not.toContain('backups');
    expect(chunks).not.toContain('media');
    expect(chunks).not.toContain('content');
  });
});
