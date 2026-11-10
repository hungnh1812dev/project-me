import { expect, test } from '@playwright/test';

import { signInAsOwner } from '../src/Session.fixture';

const DESKTOP = { width: 1280, height: 800 };
const ZERO_SECONDS = '0s';
const NO_SHADOW = 'none';
const NO_WIDTH = '0px';

test.describe('shell under media emulation', () => {
  test('forced colours: sidebar edge, header edge and the active item stay distinguishable', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await expect(page.locator('aside a').first()).toBeVisible();

    const edges = await page.evaluate(() => {
      const edgeOf = (element: Element) => {
        const style = getComputedStyle(element);
        return {
          shadow: style.boxShadow,
          borderRight: style.borderRightWidth,
          borderBottom: style.borderBottomWidth,
          outline: style.outlineStyle,
        };
      };
      const aside = document.querySelector('aside');
      const header = document.querySelector('header');
      const active = document.querySelector('aside [aria-current="page"]');
      const other = document.querySelector('aside a:not([aria-current])');
      const markOf = (element: Element | null) => {
        if (!element) return null;
        const style = getComputedStyle(element);
        const bar = getComputedStyle(element, '::before');
        return [
          style.fontWeight,
          style.borderLeftWidth,
          style.outlineStyle,
          bar.content,
          bar.backgroundColor,
        ];
      };
      return {
        aside: aside && edgeOf(aside),
        header: header && edgeOf(header),
        active: markOf(active),
        other: markOf(other),
      };
    });

    expect(edges.aside).not.toBeNull();
    expect(edges.header).not.toBeNull();
    const asideHasEdge = edges.aside!.shadow !== NO_SHADOW || edges.aside!.borderRight !== NO_WIDTH;
    const headerHasEdge =
      edges.header!.shadow !== NO_SHADOW || edges.header!.borderBottom !== NO_WIDTH;
    expect.soft(asideHasEdge, 'sidebar edge visible in forced colours').toBe(true);
    expect.soft(headerHasEdge, 'header bottom edge visible in forced colours').toBe(true);
    expect.soft(edges.active).not.toEqual(edges.other);
  });

  test('reduced motion: item and header transitions compute 0s', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize(DESKTOP);
    await signInAsOwner(page);
    await expect(page.locator('aside a').first()).toBeVisible();

    const durations = await page.evaluate(() =>
      ['aside a', 'header', 'header button'].map((selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element).transitionDuration : null;
      }),
    );
    for (const duration of durations) {
      expect(duration).not.toBeNull();
      for (const part of duration!.split(',')) expect(part.trim()).toBe(ZERO_SECONDS);
    }
  });
});
