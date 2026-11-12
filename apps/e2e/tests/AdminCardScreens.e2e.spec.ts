import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { CV_PAGE_SLUG } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';
import { signInAs } from '../src/Session.fixture';

const SURFACE_RADIUS_PX = '16px';
const NARROW_VIEWPORT = { width: 375, height: 800 };
const WIDE_VIEWPORT = { width: 1280, height: 800 };
const OVERFLOW_TOLERANCE_PX = 1;
/** Screens checked on their own below: roles (its table), and the empty or prompt states of the others. */
const CARDLESS_PATHS = ['/roles', '/backups', `/content/${CV_PAGE_SLUG}`];
const CARD_WAIT_MS = 5000;
const TRANSPARENT = /rgba\(0, 0, 0, 0\)|transparent/;

/** Signed-out pages whose form panel is a card, and the signed-in screens built from cards. */
const AUTH_PATHS = ['/login', '/reset-password', '/set-password'];
const CARD_PATHS = [
  '/',
  '/accounts',
  '/roles',
  '/api-tokens',
  '/settings/profile',
  '/settings/password',
  '/settings/security',
  '/reviewer',
  '/backups',
  '/media',
  `/content/${CV_PAGE_SLUG}`,
];

/** Cards of the page: computed radius, border and shadow, and whether one sits inside another. */
function readCards(page: Page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>('[data-slot="card"]')];
    return cards.map((el) => {
      const cs = getComputedStyle(el);
      return {
        radius: cs.borderTopLeftRadius,
        borderWidth: cs.borderTopWidth,
        borderColor: cs.borderTopColor,
        shadow: cs.boxShadow,
        background: cs.backgroundColor,
        nested: Boolean(el.parentElement?.closest('[data-slot="card"]')),
      };
    });
  });
}

/** Client-side navigation: the dev proxy forwards a hard load of `/api-tokens` to the API (prefix `/api`). */
async function openScreen(page: Page, path: string): Promise<void> {
  await page.goto('/');
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

const pageOverflowPx = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe.serial('cms-admin card screens', { tag: ['@cms-admin', '@cms-api'] }, () => {
  let context: BrowserContext;
  let page: Page;
  const consoleProblems: string[] = [];
  const failedRequests: string[] = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: WIDE_VIEWPORT });
    page = await context.newPage();
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) consoleProblems.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  for (const viewport of [WIDE_VIEWPORT, NARROW_VIEWPORT]) {
    test(`signed out: auth pages are cards without overflow at ${viewport.width}px`, async () => {
      await page.setViewportSize(viewport);
      for (const path of AUTH_PATHS) {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        const cards = await readCards(page);
        expect(cards, path).toHaveLength(1);
        const [card] = cards;
        if (!card) throw new Error(`no card on ${path}`);
        expect(card.radius, path).toBe(SURFACE_RADIUS_PX);
        expect(card.borderColor, path).toMatch(TRANSPARENT);
        expect(card.shadow, path).not.toBe('none');
        await expect(page.locator('main button[type="submit"]'), path).toHaveCount(1);
        expect(await pageOverflowPx(page), path).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
      }
    });
  }

  test('reset-password links show the halo plus edge on Tab', async () => {
    await page.goto('/reset-password');
    // Email, then the submit button, then the link back to sign in.
    for (let step = 0; step < 3; step += 1) await page.keyboard.press('Tab');
    const link = page.getByRole('link', { name: /sign in/i });
    await expect(link).toBeFocused();
    // The ring fades in with the fast transition, so poll until it settles.
    await expect.poll(() => link.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('3px');
    const edge = await link.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
    });
    expect(edge.outlineStyle).toBe('solid');
    expect(edge.outlineWidth).toBe('1px');
  });

  test('forced colours: the login card keeps a visible border', async () => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/login');
    await expect(page.locator('h1')).toBeVisible();
    const [card] = await readCards(page);
    if (!card) throw new Error('the login card is missing');
    expect(card.borderWidth).toBe('1px');
    expect(card.borderColor).not.toMatch(TRANSPARENT);
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('sign in as owner', async () => {
    await page.setViewportSize(WIDE_VIEWPORT);
    await signInAs(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
  });

  for (const viewport of [WIDE_VIEWPORT, NARROW_VIEWPORT]) {
    test(`signed in: every screen is cards, no nesting, no overflow at ${viewport.width}px`, async () => {
      await page.setViewportSize(viewport);
      const report: string[] = [];
      for (const path of CARD_PATHS) {
        await openScreen(page, path);
        await expect(page.locator('main h1, main h2, h1').first()).toBeVisible();
        await page
          .locator('[data-slot="card"]')
          .first()
          .waitFor({ timeout: CARD_WAIT_MS })
          .catch(() => undefined);
        const cards = await readCards(page);
        const overflow = await pageOverflowPx(page);
        const mainText = await page.locator('main').first().innerText();
        report.push(
          `${path}: ${cards.length} cards, overflow ${overflow}px, text: ${mainText.replace(/\s+/g, ' ').slice(0, 260)}`,
        );
        if (!CARDLESS_PATHS.includes(path)) {
          expect.soft(cards.length, `${path} has cards`).toBeGreaterThan(0);
        }
        for (const card of cards) {
          expect.soft(card.radius, `${path} radius`).toBe(SURFACE_RADIUS_PX);
          expect.soft(card.borderColor, `${path} border`).toMatch(TRANSPARENT);
          expect.soft(card.nested, `${path} nested card`).toBe(false);
        }
        expect.soft(overflow, `${path} page overflow`).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
      }
      console.log(`CARD SCREENS ${viewport.width}\n${report.join('\n')}`);
    });
  }

  test('forced colours: access, settings and status cards keep a visible border', async () => {
    await page.setViewportSize(WIDE_VIEWPORT);
    await page.emulateMedia({ forcedColors: 'active' });
    for (const path of ['/accounts', '/settings/profile', '/']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const cards = await readCards(page);
      expect(cards.length, path).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.borderColor, path).not.toMatch(TRANSPARENT);
      }
    }
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('document edit: sticky action bar stays at the bottom on the card colour', async () => {
    await page.goto(`/content/${CV_PAGE_SLUG}/new`);
    await page.waitForLoadState('networkidle');
    const bar = page.locator('div.sticky.bottom-0').first();
    await expect(bar).toBeVisible();
    const info = await bar.evaluate((el) => {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        background: cs.backgroundColor,
        borderTop: cs.borderTopWidth,
        shadow: cs.boxShadow,
        bottomGap: Math.round(window.innerHeight - rect.bottom),
      };
    });
    expect(info.borderTop).toBe('0px');
    expect(info.shadow).not.toBe('none');
    expect(info.bottomGap).toBe(0);
  });

  test('status home lays its cards in a grid with 24 px gaps, 32 px at 1280 px', async () => {
    const gapOf = async (width: number) => {
      await page.setViewportSize({ width, height: 800 });
      await openScreen(page, '/');
      const card = page.locator('[data-slot="card"]').first();
      await expect(card).toBeVisible();
      return card.evaluate((el) => {
        const cs = getComputedStyle(el.parentElement as HTMLElement);
        return { display: cs.display, gap: cs.columnGap, rowGap: cs.rowGap };
      });
    };
    const narrow = await gapOf(NARROW_VIEWPORT.width);
    const wide = await gapOf(WIDE_VIEWPORT.width);
    console.log('STATUS GRID', JSON.stringify({ narrow, wide }));
    expect(wide.display).toBe('grid');
    expect(narrow.rowGap).toBe('24px');
    expect(wide.rowGap).toBe('32px');
  });

  test('the walk raised no console problem and no unexpected failed request', () => {
    expect(consoleProblems.filter((text) => !text.includes('Failed to load resource'))).toEqual([]);
    const unexpected = failedRequests.filter(
      (entry) => !/\/(set-password|reset-password)|\/auth\//.test(entry),
    );
    console.log('FAILED REQUESTS', JSON.stringify(failedRequests));
    expect(unexpected).toEqual([]);
  });

  test('roles: the table sits in a flush card and the role link shows the ring on Tab', async () => {
    await openScreen(page, '/roles');
    await page.waitForLoadState('networkidle');
    const padding = await page
      .locator('[data-slot="card"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-padding')));
    expect(padding).toContain('flush');
    const link = page.locator('main a[href^="/roles/"]').first();
    await link.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(link).toBeFocused();
    await expect.poll(() => link.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('3px');
    expect(await link.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    await link.click();
    await page.waitForLoadState('networkidle');
    const matrixCards = await readCards(page);
    expect(matrixCards.length).toBeGreaterThan(0);
    expect(matrixCards.some((card) => card.nested)).toBe(false);
  });

  test('empty states stay inside a card', async () => {
    await openScreen(page, `/content/${CV_PAGE_SLUG}`);
    await expect(page.getByText('No documents yet')).toBeVisible();
    const empty = page.getByText('No documents yet');
    await expect(page.locator('[data-slot="card"]').filter({ has: empty })).toHaveCount(1);
  });
  test('a failed request shows the inline error with a retry, no broken layout', async () => {
    await page.route('**/api/v1/accounts*', (route) => route.abort());
    await openScreen(page, '/accounts');
    const alert = page.locator('main [role="alert"]').first();
    await expect(alert).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    expect(await pageOverflowPx(page)).toBeLessThanOrEqual(0);
    await page.unroute('**/api/v1/accounts*');
  });
});
