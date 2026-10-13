import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Story-test helpers (AC-11). `gotoStory` opens one story in the preview iframe with the theme
 * global; the rest are copied from the cms-admin e2e suite (`fixtures/jsonEditor.ts`,
 * `a11y.spec.ts`).
 */
export type Theme = 'light' | 'dark';

export const THEMES = ['light', 'dark'] as const satisfies readonly Theme[];

const DARK = /(^|\s)dark(\s|$)/;

/** The theme decorator puts `dark` on `<html>` (AC-8); this waits until it matches `theme`. */
export async function expectTheme(page: Page, theme: Theme): Promise<void> {
  const html = expect(page.locator('html'));
  await (theme === 'dark' ? html.toHaveClass(DARK) : html.not.toHaveClass(DARK));
}

export interface GotoStoryOptions {
  theme?: Theme;
  /** Viewport width in px; the height stays 812 like the cms-admin a11y suite. */
  width?: number;
}

/** The URL of one story in the preview iframe, with the theme set through Storybook globals. */
export const storyUrl = (id: string, theme: Theme = 'light'): string =>
  `/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=theme:${theme}`;

/**
 * Opens a story with transitions off, then waits for the theme class on `<html>` and for fonts,
 * so colour and layout assertions see the settled page.
 */
export async function gotoStory(
  page: Page,
  id: string,
  { theme = 'light', width }: GotoStoryOptions = {},
): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (width !== undefined) await page.setViewportSize({ width, height: 812 });
  await page.goto(storyUrl(id, theme));
  await expectTheme(page, theme);
  await page.evaluate('document.fonts.ready');
}

/** The text of a CodeMirror editor content locator, one `\n` per line (it is not a textarea). */
export const editorText = async (content: Locator): Promise<string> =>
  (await content.locator('.cm-line').allTextContents()).join('\n');

/** Runs axe once the theme and fonts have settled; serious or critical violations fail. */
export async function expectNoBlockingViolations(page: Page, theme: Theme): Promise<void> {
  await expectTheme(page, theme);
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
}

/** What the browser reports about the element that has focus after a Tab press. */
export interface TabStop {
  name: string;
  landmark: string;
  /** Inside `<main>`, even when a nearer `<header>` (a page header) sets `landmark`. */
  inMain: boolean;
  top: number;
  visibleFocus: boolean;
}

/**
 * Presses Tab until focus leaves the document or comes back to the first stop, and records each
 * stop. A cap well above the real count turns a keyboard trap into a test failure.
 */
export async function walkTabOrder(page: Page, cap = 120): Promise<TabStop[]> {
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
      const labelledBy = (el.getAttribute('aria-labelledby') || '').split(' ')
        .map((id) => document.getElementById(id)?.textContent || '').join(' ').trim();
      const name = (el.getAttribute('aria-label') || labelledBy || el.labels?.[0]?.textContent || el.textContent || el.getAttribute('name') || el.tagName)
        .trim().replace(/\\s+/g, ' ').slice(0, 40);
      const rect = el.getBoundingClientRect();
      if (!el.dataset.tabWalk) el.dataset.tabWalk = String(${i});
      return { key: el.dataset.tabWalk, name, landmark, inMain: !!el.closest('main'), top: rect.top + window.scrollY, visibleFocus: outline || ring };
    })()`);
    if (!stop) return stops;
    if (first === null) first = stop.key;
    else if (stop.key === first) return stops;
    stops.push({
      name: stop.name,
      landmark: stop.landmark,
      inMain: stop.inMain,
      top: stop.top,
      visibleFocus: stop.visibleFocus,
    });
  }
  throw new Error(`Focus never left the page after ${cap} Tab presses (a keyboard trap?)`);
}
