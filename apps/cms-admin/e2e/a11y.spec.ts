import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import type { ContentType } from '../src/features/content/types.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

/**
 * Accessibility gates (AC-45, AC-46): axe on every listed page in both themes at desktop and
 * phone width, plus keyboard-only walks with a visible focus indicator on every Tab stop.
 */
const STAMP = '2026-01-01T00:00:00.000Z';
const ARTICLE: ContentType = {
  documentId: 'ct-article',
  slug: 'article',
  name: 'Article',
  kind: 'collection',
  draftToPublish: true,
  fields: [{ name: 'title', type: 'text', header: true }],
  listFields: ['title'],
  createdAt: STAMP,
  updatedAt: STAMP,
};

const PAGES = [
  { path: '/login', heading: 'Sign in', signedIn: false },
  { path: '/register', heading: 'Create account', signedIn: false },
  { path: '/forgot-password', heading: 'Reset your password', signedIn: false },
  { path: '/403', heading: 'Access denied', signedIn: false },
  { path: '/admin', heading: 'Welcome, Jane Doe', signedIn: true },
  { path: '/admin/profile', heading: 'Your profile', signedIn: true },
  { path: '/admin/content-types/article', heading: 'Article', signedIn: true },
  { path: '/admin/dev/ui-kit', heading: 'UI kit', signedIn: true },
];
const THEMES = ['light', 'dark'] as const;
const DARK = /(^|\s)dark(\s|$)/;
const WIDTHS = [1280, 375] as const;

/** Jane can read content types, so the content-type page and its menu render. */
function seed(mockApi: MockApi, signedIn: boolean) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role: ROLES.contentEditor });
  mockApi.content.addContentType(ARTICLE);
  if (signedIn) mockApi.signInAs('jane@example.com');
}

/** Stores the theme choice before any page script runs, and turns transitions off. */
async function prepare(page: Page, theme: string, width: number) {
  await page.addInitScript({
    content: `window.localStorage.setItem('cms-admin:theme', '${theme}');`,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width, height: 812 });
}

for (const { path, heading, signedIn } of PAGES) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: ${path} has no serious or critical violations (${theme}, ${width}px)`, async ({
        page,
        mockApi,
      }) => {
        seed(mockApi, signedIn);
        await prepare(page, theme, width);

        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
        const html = expect(page.locator('html'));
        await (theme === 'dark' ? html.toHaveClass(DARK) : html.not.toHaveClass(DARK));
        await page.evaluate('document.fonts.ready');

        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        const blocking = results.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => ({
            id: v.id,
            impact: v.impact,
            targets: v.nodes.map((n) => n.target.join(' ')),
          }));

        expect(blocking).toEqual([]);
      });
    }
  }
}

/** What the browser reports about the element that has focus after a Tab press. */
interface TabStop {
  name: string;
  landmark: string;
  top: number;
  visibleFocus: boolean;
}

/**
 * Presses Tab until focus leaves the document or comes back to the first stop, and records each
 * stop. A cap well above the real count turns a keyboard trap into a test failure.
 */
async function walkTabOrder(page: Page, cap = 120): Promise<TabStop[]> {
  const stops: TabStop[] = [];
  let first: string | null = null;
  for (let i = 0; i < cap; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate<(TabStop & { key: string }) | null>(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const outline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
      const ring = style.boxShadow !== 'none';
      const region = el.closest('[data-sidebar="sidebar"], header, main, footer');
      const landmark = el.matches('a[href="#main-content"]')
        ? 'skip'
        : region
          ? region.tagName === 'DIV' ? 'nav' : region.tagName.toLowerCase()
          : 'other';
      const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || el.tagName)
        .trim().replace(/\\s+/g, ' ').slice(0, 40);
      const rect = el.getBoundingClientRect();
      if (!el.dataset.tabWalk) el.dataset.tabWalk = String(${i});
      return { key: el.dataset.tabWalk, name, landmark, top: rect.top + window.scrollY, visibleFocus: outline || ring };
    })()`);
    if (!stop) return stops;
    if (first === null) first = stop.key;
    else if (stop.key === first) return stops;
    stops.push({
      name: stop.name,
      landmark: stop.landmark,
      top: stop.top,
      visibleFocus: stop.visibleFocus,
    });
  }
  throw new Error(`Focus never left the page after ${cap} Tab presses (a keyboard trap?)`);
}

/** Collapses consecutive repeats: ['a', 'a', 'b'] → ['a', 'b']. */
const runs = (values: string[]) => values.filter((v, i) => v !== values[i - 1]);

test('keyboard walk in the shell: skip link, menu, header, main, with visible focus (AC-45)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, true);
  await page.setViewportSize({ width: 1280, height: 812 });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Article' })).toBeVisible();

  const stops = await walkTabOrder(page);

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  expect(runs(stops.map((s) => s.landmark))).toEqual(['skip', 'nav', 'header', 'main']);
  expect(stops.map((s) => s.name)).toEqual(
    expect.arrayContaining(['Skip to content', 'Article', 'Toggle menu', 'Your profile']),
  );
});

test('keyboard walk on the mobile shell reaches the menu button first (AC-45)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, true);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Welcome, Jane Doe' })).toBeVisible();

  const stops = await walkTabOrder(page);

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  // The drawer is closed, so no menu link takes focus behind it.
  expect(runs(stops.map((s) => s.landmark))).toEqual(['skip', 'header', 'main']);
  expect(stops[1].name).toBe('Toggle menu');
});

for (const { path, heading } of PAGES.filter((p) => !p.signedIn)) {
  test(`keyboard walk on ${path} follows the visual order with visible focus (AC-45)`, async ({
    page,
    mockApi,
  }) => {
    seed(mockApi, false);
    await page.setViewportSize({ width: 1280, height: 812 });
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();

    const stops = await walkTabOrder(page);

    expect(stops.length).toBeGreaterThan(0);
    expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
    // Single-column card: each stop sits at or below the one before it.
    const tops = stops.map((s) => Math.round(s.top));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });
}

test('keyboard walk on the UI kit reaches every control with visible focus (AC-45)', async ({
  page,
  mockApi,
}) => {
  seed(mockApi, true);
  await page.setViewportSize({ width: 1280, height: 812 });
  await page.goto('/admin/dev/ui-kit');
  await expect(page.getByRole('heading', { name: 'UI kit', level: 1 })).toBeVisible();

  const stops = await walkTabOrder(page, 200);
  const inMain = stops.filter((s) => s.landmark === 'main');

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  // Disabled controls are skipped; every other visible control in main is a Tab stop.
  const enabled = await page.evaluate<number>(
    `[...document.querySelectorAll('main *')].filter(
      (el) => el.tabIndex >= 0 && !el.disabled && el.checkVisibility(),
    ).length`,
  );
  expect(inMain.length).toBe(enabled);
});
