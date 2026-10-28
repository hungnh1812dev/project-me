import { expect, test } from '@playwright/test';

import {
  ADMIN_COPY,
  APP_ROUTES,
  contentListPath,
  contentNewPath,
} from '../src/Apps.contract';
import { CV_PAGE_SLUG } from '../src/E2e.constants';
import { signInAsOwner, submitLogin } from '../src/Session.fixture';
import { e2eEnv } from '../src/E2e.env';
import { expectNoViolation, watchCsp } from '../src/CspWatch.fixture';

// The Vite dev server sends no CSP, so on the dev stack this spec has nothing
// to catch; it guards the production build behind nginx (tier 3).
test.describe('admin console CSP (production build behind nginx; nothing to catch on the dev stack)', () => {
  test('no CSP violation on a cold load, after login, after a reload and on the main admin pages', async ({
    page,
  }) => {
    const readViolations = await watchCsp(page);

    // Cold load of the login page; an empty submit still validates.
    await page.goto(APP_ROUTES.LOGIN);
    await expect(
      page.getByRole('heading', { level: 1, name: ADMIN_COPY.login.title }),
    ).toBeVisible();
    await page.getByRole('button', { name: ADMIN_COPY.login.submit }).click();
    await expect(
      page.getByText(ADMIN_COPY.login.validation.emailRequired).first(),
    ).toBeVisible();
    await expectNoViolation(readViolations, 'cold /login');

    await submitLogin(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toBeVisible();
    await expectNoViolation(readViolations, 'the page after login');

    await page.goto(APP_ROUTES.REVIEWER_SESSIONS);
    await expect(page).toHaveURL(
      new RegExp(`${APP_ROUTES.REVIEWER_SESSIONS}$`),
    );
    await expectNoViolation(readViolations, APP_ROUTES.REVIEWER_SESSIONS);

    await page.reload();
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toBeVisible();
    await expectNoViolation(readViolations, 'reloaded /reviewer');

    await page.goto(contentListPath(CV_PAGE_SLUG));
    await expect(
      page
        .getByRole('link', { name: ADMIN_COPY.content.collection.newDocument })
        .first(),
    ).toBeVisible();
    await expectNoViolation(readViolations, 'a content list');

    await page.goto(contentNewPath(CV_PAGE_SLUG));
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toBeVisible();
    await expectNoViolation(readViolations, 'a content form');

    await page.goto(APP_ROUTES.BACKUPS);
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toBeVisible();
    await expectNoViolation(readViolations, APP_ROUTES.BACKUPS);

    await page.goto(APP_ROUTES.ACCOUNTS);
    await page
      .getByRole('button', { name: ADMIN_COPY.access.accounts.invite })
      .click();
    await expect(
      page.getByRole('dialog', { name: ADMIN_COPY.access.invite.title }),
    ).toBeVisible();
    await expectNoViolation(readViolations, 'the invite dialog');

    await page.goto(APP_ROUTES.SECURITY_SETTINGS);
    await expect(
      page.getByRole('heading', { level: 1, name: ADMIN_COPY.security.title }),
    ).toBeVisible();
    await expectNoViolation(readViolations, APP_ROUTES.SECURITY_SETTINGS);
  });

  test('signing in first and then loading a page cold shows no CSP violation', async ({
    page,
  }) => {
    const readViolations = await watchCsp(page);
    await signInAsOwner(page);
    await page.goto(APP_ROUTES.BACKUPS);
    await page.reload();
    await expect(
      page.getByRole('button', { name: ADMIN_COPY.session.signOut }),
    ).toBeVisible();
    await expectNoViolation(readViolations, 'a reloaded signed-in page');
  });
});
