import { expect, test } from '@playwright/test';

import { ADMIN_COPY, APP_ROUTES } from '../src/Apps.contract';
import { signInAsOwner } from '../src/Session.fixture';

const copy = ADMIN_COPY.backups;
const VIEWPORTS = [
  { width: 375, height: 800 },
  { width: 1280, height: 800 },
];

for (const viewport of VIEWPORTS) {
  test.describe(
    `backups page console at ${viewport.width}px`,
    { tag: ['@cms-admin', '@cms-api', '@backups'] },
    () => {
      test.use({ viewport });

      test('first state and not-configured state raise no console error or CSP violation', async ({
        page,
      }) => {
        const problems: string[] = [];
        page.on('console', (message) => {
          if (message.type() === 'error') problems.push(message.text());
        });
        page.on('pageerror', (error) => problems.push(error.message));
        await signInAsOwner(page);
        await page.goto(APP_ROUTES.BACKUPS);
        const button = page.getByRole('button', { name: copy.check.button });
        await expect(button).toBeVisible();
        await button.click();
        await expect(page.getByText(copy.notConfigured.title)).toBeVisible();
        expect(
          problems.filter((text) => !/\b40[134]\b|Failed to load resource/.test(text)),
        ).toEqual([]);
      });
    },
  );
}
