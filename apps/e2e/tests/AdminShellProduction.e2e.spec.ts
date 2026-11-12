import { expect, test } from '@playwright/test';

import { signInAsOwner } from '../src/Session.fixture';

const DESKTOP = { width: 1280, height: 800 };
const NOTIFICATIONS_REGION = /^Notifications/;
const HEADER_HEIGHT_PX = '64px';

test.describe('shell in the production build', () => {
  test('sticky sidebar and header render from the production CSS, no console error, toast region mounted', async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    // after sign-in: the anonymous session probe before it answers 401 by design
    const problems: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    page.on('pageerror', (error) => problems.push(error.message));
    await page.locator('aside nav a').first().click();
    await expect(page.locator('aside [aria-current="page"]')).toBeVisible();

    const shell = await page.evaluate(() => {
      const aside = getComputedStyle(document.querySelector('aside')!);
      const header = getComputedStyle(document.querySelector('header')!);
      const active = document.querySelector('aside [aria-current="page"]');
      return {
        asideSticky: aside.position,
        asideShadow: aside.boxShadow,
        headerSticky: header.position,
        headerHeight: header.height,
        headerBlur: header.backdropFilter || header.getPropertyValue('-webkit-backdrop-filter'),
        activeBackground: active ? getComputedStyle(active).backgroundColor : null,
        stylesheets: document.styleSheets.length,
      };
    });
    expect(shell.asideSticky).toBe('sticky');
    expect(shell.asideShadow).not.toBe('none');
    expect(shell.headerSticky).toBe('sticky');
    expect(shell.headerHeight).toBe(HEADER_HEIGHT_PX);
    expect(shell.headerBlur).toContain('blur');
    expect(shell.activeBackground).not.toBeNull();
    expect(shell.activeBackground).not.toBe('rgba(0, 0, 0, 0)');

    await expect(page.getByRole('region', { name: NOTIFICATIONS_REGION })).toBeAttached();
    expect(problems).toEqual([]);
  });
});
