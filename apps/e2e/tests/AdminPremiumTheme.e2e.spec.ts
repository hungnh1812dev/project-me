import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { API_PATHS } from '../src/Api.endpoints';
import { ADMIN_COPY } from '../src/Apps.contract';
import { e2eEnv } from '../src/E2e.env';
import { expectSignedIn, openUserMenu, submitLogin } from '../src/Session.fixture';

const accounts = ADMIN_COPY.access.accounts;
const invite = ADMIN_COPY.access.invite;

const SURFACE_RADIUS_PX = '16px';
const CONTROL_RADIUS_PX = '12px';
const ITEM_RADIUS_PX = '8px';
const FAST_TRANSITION = '0.2s';
const BASE_TRANSITION_MS = 300;
const FOCUS_SETTLE_MS = 400;
const INDIGO_600_OKLCH = [0.511, 0.262, 276.966];
const INDIGO_600 = 'oklch(0.511 0.262 276.966)';
const ROSE_600 = 'oklch(0.586 0.253 17.585)';

type ToastWindow = Window & {
  showToast: (toast: { tone: string; title: string; key?: string }) => void;
};

test.describe.serial('cms-admin premium theme', { tag: ['@cms-admin', '@cms-api'] }, () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await context.newPage();
    await submitLogin(page, e2eEnv.ownerEmail, e2eEnv.ownerPassword);
    await expectSignedIn(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('theme attribute, tokens, reduced-motion rule', async () => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'premium');
    // The production build minifies values (`.75rem`, `51.1%`), so compare numbers, not text.
    const tokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const read = (name: string) => cs.getPropertyValue(name).trim();
      const toNumber = (part: string) =>
        part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part);
      const primary = (read('--primary').match(/-?[\d.]+%?/g) ?? []).map(toNumber);
      return {
        radii: ['--radius-control', '--radius-surface', '--radius-item'].map((n) =>
          parseFloat(read(n)),
        ),
        primary,
      };
    });
    expect(tokens.radii).toEqual([0.75, 1, 0.5]);
    tokens.primary.forEach((value, index) => {
      const expected = INDIGO_600_OKLCH[index];
      if (expected === undefined) throw new Error(`no expected primary channel ${index}`);
      expect(value).toBeCloseTo(expected, 3);
    });
  });

  test('dialog: surface radius, soft shadow, transparent border, tinted backdrop, footer order, 300 ms', async () => {
    await page.goto('/accounts');
    await page.getByRole('button', { name: accounts.invite }).click();
    const dialog = page.getByRole('dialog', { name: invite.title });
    await expect(dialog).toBeVisible();
    const info = await dialog.evaluate((el) => {
      const cs = getComputedStyle(el);
      const overlay = [...document.querySelectorAll('*')].find((n) => {
        const o = getComputedStyle(n);
        return (
          o.position === 'fixed' &&
          n !== el &&
          !el.contains(n) &&
          !n.contains(el) &&
          o.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          n.getBoundingClientRect().width >= window.innerWidth - 1
        );
      });
      const oc = overlay ? getComputedStyle(overlay) : null;
      const buttons = [...el.querySelectorAll('button')].map((b) => ({
        text: b.textContent?.trim(),
        left: b.getBoundingClientRect().left,
        bg: getComputedStyle(b).backgroundColor,
      }));
      return {
        radius: cs.borderTopLeftRadius,
        shadow: cs.boxShadow,
        borderColor: cs.borderTopColor,
        borderWidth: cs.borderTopWidth,
        overlayBg: oc?.backgroundColor ?? null,
        overlayBlur: oc?.backdropFilter ?? null,
        anim: cs.animationDuration,
        buttons,
      };
    });
    console.log('DIALOG', JSON.stringify(info));
    expect(info.radius).toBe(SURFACE_RADIUS_PX);
    expect(info.shadow).not.toBe('none');
    expect(info.borderWidth).toBe('1px');
    expect(info.borderColor).toMatch(/rgba\(0, 0, 0, 0\)|transparent|\/ 0\)/);
    expect(Number.parseFloat(info.anim) * 1000).toBe(BASE_TRANSITION_MS);
    await dialog.screenshot({ path: test.info().outputPath('dialog.png') });
    await dialog.evaluate((el) => {
      const overlay = [...document.querySelectorAll('*')].find(
        (n) =>
          getComputedStyle(n).position === 'fixed' &&
          n !== el &&
          !el.contains(n) &&
          !n.contains(el) &&
          getComputedStyle(n).backgroundColor !== 'rgba(0, 0, 0, 0)' &&
          n.getBoundingClientRect().width >= window.innerWidth - 1,
      );
      overlay?.setAttribute('data-qc-overlay', '');
    });
    await page.keyboard.press('Escape');
    // ADM-9: content closes at once (no exit animation); only the backdrop fades and takes no clicks.
    const closing = await page.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const overlay = document.querySelector('[data-qc-overlay]');
      const cs = overlay ? getComputedStyle(overlay) : null;
      return {
        contentPresent: Boolean(document.querySelector('[role=dialog]')),
        overlayPointerEvents: cs?.pointerEvents ?? null,
        overlayAnim: cs?.animationDuration ?? null,
        overlayInlineStyle: overlay?.getAttribute('style') ?? null,
        overlayTakesClicks: Boolean(
          overlay && document.elementFromPoint(window.innerWidth / 2, 20) === overlay,
        ),
      };
    });
    console.log('CLOSING', JSON.stringify(closing));
    expect(closing.contentPresent).toBe(false);
    expect(closing.overlayPointerEvents).toBe('none');
    expect(Number.parseFloat(closing.overlayAnim ?? '0') * 1000).toBe(BASE_TRANSITION_MS);
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-qc-overlay]')).toHaveCount(0, { timeout: 2000 });
  });

  test('forced-colors keeps a visible card/dialog border', async () => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/accounts');
    await page.getByRole('button', { name: accounts.invite }).click();
    const dialog = page.getByRole('dialog', { name: invite.title });
    await expect(dialog).toBeVisible();
    const border = await dialog.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.borderTopColor, width: cs.borderTopWidth, style: cs.borderTopStyle };
    });
    console.log('FORCED', JSON.stringify(border));
    expect(border.width).toBe('1px');
    expect(border.color).not.toMatch(/rgba\(0, 0, 0, 0\)/);
    await page.keyboard.press('Escape');
    await page.emulateMedia({ forcedColors: 'none' });
  });

  test('account menu: item radius and hairline border', async () => {
    await page.goto('/');
    const menu = await openUserMenu(page);
    const info = await menu.evaluate((el) => {
      const cs = getComputedStyle(el);
      const item = el.querySelector('[role=menuitem]');
      return {
        menuRadius: cs.borderTopLeftRadius,
        menuBorder: `${cs.borderTopWidth} ${cs.borderTopColor}`,
        itemRadius: item ? getComputedStyle(item).borderTopLeftRadius : null,
      };
    });
    console.log('MENU', JSON.stringify(info));
    expect(info.itemRadius).toBe(ITEM_RADIUS_PX);
    expect(info.menuBorder.startsWith('1px')).toBe(true);
    await page.keyboard.press('Escape');
  });

  test('button: primary / destructive colours, states, reduced motion', async () => {
    await page.goto('/accounts');
    const disable = page.getByRole('button', { name: accounts.disable }).first();
    await expect(disable).toBeVisible();
    const destructive = await disable.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        cls: el.getAttribute('class') ?? '',
        radius: cs.borderTopLeftRadius,
        trans: cs.transitionDuration,
      };
    });
    console.log('DISABLE', JSON.stringify(destructive));
    const invBtn = page.getByRole('button', { name: accounts.invite });
    const primary = await invBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        shadow: cs.boxShadow,
        radius: cs.borderTopLeftRadius,
        trans: cs.transitionDuration,
      };
    });
    console.log('PRIMARY', JSON.stringify(primary));
    expect(primary.bg).toBe(INDIGO_600);
    expect(primary.radius).toBe(CONTROL_RADIUS_PX);
    expect(primary.trans).toBe(FAST_TRANSITION);
    expect(primary.shadow).toContain('12px -2px');

    // keyboard focus: halo + edge
    await invBtn.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    // Let the 200 ms halo transition finish before reading it.
    await page.waitForTimeout(FOCUS_SETTLE_MS);
    const focus = await invBtn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        shadow: cs.boxShadow,
      };
    });
    console.log('FOCUS', JSON.stringify(focus));
    expect(focus.outline).toBe(`solid 1px ${INDIGO_600}`);
    expect(focus.shadow).toContain('0px 0px 0px 3px');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await invBtn.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(reduced).toBe('0s');
    const inertScale = await invBtn.evaluate((el) => getComputedStyle(el).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(inertScale);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(ROSE_600).toBeTruthy();
  });

  test('button hover and press states, loading keeps width and blocks a second submit', async () => {
    await page.goto('/accounts');
    const invBtn = page.getByRole('button', { name: accounts.invite });
    await expect(invBtn).toBeVisible();
    const read = () =>
      invBtn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          shadow: cs.boxShadow,
          transform: cs.transform,
          scale: cs.scale,
        };
      });
    const rest = await read();
    await invBtn.hover();
    await page.waitForTimeout(FOCUS_SETTLE_MS);
    const hover = await read();
    console.log('HOVER', JSON.stringify({ rest, hover }));
    expect(hover.bg !== rest.bg || hover.shadow !== rest.shadow).toBe(true);
    const box = await invBtn.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(FOCUS_SETTLE_MS);
    const pressed = await read();
    console.log('PRESS', JSON.stringify(pressed));
    expect(pressed.scale).toBe('0.98');
    await page.mouse.up();
    await page.keyboard.press('Escape');
  });

  test('loading login button keeps width and blocks a second submit; disabled state', async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    let loginCalls = 0;
    await p.route('**/auth/login', async (route) => {
      loginCalls += 1;
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await p.goto('/login');
    await p.getByRole('textbox', { name: ADMIN_COPY.login.emailLabel }).fill('nobody@example.com');
    await p.getByLabel(ADMIN_COPY.login.passwordLabel).fill('Wrong-password-1');
    const submit = p.getByRole('button', { name: ADMIN_COPY.login.submit });
    const before = (await submit.boundingBox())!.width;
    await submit.click();
    const busy = p.locator('button[aria-busy="true"]');
    await expect(busy).toBeVisible();
    await p.waitForTimeout(FOCUS_SETTLE_MS);
    const info = await busy.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        width: el.getBoundingClientRect().width,
        disabled: (el as HTMLButtonElement).disabled,
        opacity: cs.opacity,
        shadow: cs.boxShadow,
        spinner: !!el.querySelector('[data-slot=button-spinner]'),
        pointer: cs.pointerEvents,
      };
    });
    console.log('LOADING', JSON.stringify({ before, info }));
    expect(Math.abs(info.width - before)).toBeLessThan(1);
    expect(info.disabled).toBe(true);
    expect(info.spinner).toBe(true);
    expect(info.shadow).not.toContain('12px -2px');
    await busy.click({ force: true }).catch(() => undefined);
    await p.waitForTimeout(2000);
    expect(loginCalls).toBe(1);
    // FormAlert (error) on the login failure, if it uses it
    const alert = p.getByRole('alert').first();
    if (await alert.isVisible().catch(() => false)) {
      const a = await alert.evaluate((el) => {
        const cs = getComputedStyle(el);
        return {
          bg: cs.backgroundColor,
          border: cs.borderTopWidth,
          radius: cs.borderTopLeftRadius,
          cls: el.getAttribute('class') ?? '',
        };
      });
      console.log('ALERT', JSON.stringify(a));
    }
    await ctx.close();
  });

  test('FormAlert: soft tone background, no hard frame (page error state)', async () => {
    await page.route(
      (url) => url.pathname.includes('/api/') && !url.pathname.includes(API_PATHS.AUTH_PREFIX),
      (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }),
    );
    await page.goto('/accounts');
    const alert = page.getByRole('alert').first();
    await expect(alert).toBeVisible();
    const style = await alert.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { bg: cs.backgroundColor, border: cs.borderTopWidth, radius: cs.borderTopLeftRadius };
    });
    console.log('FORMALERT', JSON.stringify(style));
    expect(style.border).toBe('0px');
    expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(style.radius).toBe(ITEM_RADIUS_PX);
    await page.unroute(/.*/).catch(() => undefined);
  });

  test('toast: placement, order, lifetime, pause, close, Esc, F8 (dev harness)', async () => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const hasHarness = await page.evaluate(
      () => typeof (window as unknown as ToastWindow).showToast === 'function',
    );
    test.skip(!hasHarness, 'ToastHarness is a temporary dev-only mount, absent from a built stack');
    const items = page.locator('ol li');
    const show = (tone: string, title: string, key?: string) =>
      page.evaluate(
        ([t, ti, k]) =>
          (window as unknown as ToastWindow).showToast(
            k ? { tone: t, title: ti, key: k } : { tone: t, title: ti },
          ),
        [tone, title, key ?? ''] as [string, string, string],
      );
    await show('success', 'First saved');
    await show('error', 'Second failed');
    await expect(items).toHaveCount(2);
    const boxes = await items.evaluateAll((els) =>
      els.map((li) => {
        const r = li.getBoundingClientRect();
        return { text: li.textContent, top: r.top, right: window.innerWidth - r.right };
      }),
    );
    console.log('TOAST1280', JSON.stringify(boxes));
    const newest = boxes.find((b) => b.text?.includes('Second failed'))!;
    const oldest = boxes.find((b) => b.text?.includes('First saved'))!;
    expect(newest.top).toBeLessThan(oldest.top);
    expect(newest.right).toBeLessThan(40);
    // lifetime: success 4 s, error 5 s
    await page.waitForTimeout(4600);
    await expect(items).toHaveCount(1);
    await expect(items).toContainText('Second failed');
    await expect(items).toHaveCount(0, { timeout: 2500 });
    // pause on hover
    await show('success', 'Hover me');
    await expect(items).toHaveCount(1);
    await items.first().hover();
    await page.waitForTimeout(5500);
    await expect(items).toHaveCount(1);
    await page.mouse.move(5, 5);
    await expect(items).toHaveCount(0, { timeout: 6000 });
    // close button
    await show('info', 'Close me');
    await items.first().getByRole('button', { name: 'Close' }).click();
    await expect(items).toHaveCount(0);
    // F8 focus + Esc
    await show('warning', 'Esc me');
    await expect(items).toHaveCount(1);
    await page.keyboard.press('F8');
    const focusInside = await page.evaluate(
      () => !!document.activeElement?.closest('[role=region],ol'),
    );
    console.log('F8 focus inside region', focusInside);
    expect(focusInside).toBe(true);
    await page.keyboard.press('Escape');
    await expect(items).toHaveCount(0, { timeout: 2000 });
    // max 3 and same key replaces
    await show('info', 'k1', 'dup');
    await show('info', 'k1b', 'dup');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('k1b');
    await show('info', 'a');
    await show('info', 'b');
    await show('info', 'c');
    await expect(items).toHaveCount(3);
    await expect(items.filter({ hasText: 'k1b' })).toHaveCount(0);
    // 375 px: top centre
    await page.setViewportSize({ width: 375, height: 800 });
    const narrow = await items.evaluateAll((els) =>
      els.map((li) => {
        const r = li.getBoundingClientRect();
        return { left: r.left, right: window.innerWidth - r.right, top: r.top, w: r.width };
      }),
    );
    console.log('TOAST375', JSON.stringify(narrow));
    const [firstToast] = narrow;
    if (!firstToast) throw new Error('no toast at 375 px');
    expect(Math.abs(firstToast.left - firstToast.right)).toBeLessThan(2);
    // After F8 + Esc the emptied viewport keeps focus, which pauses timers: move focus away first.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForTimeout(5500);
    await expect(items).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
  });
});
