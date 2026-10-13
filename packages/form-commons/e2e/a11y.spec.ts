import { expect, test } from '@playwright/test';

import {
  expectNoBlockingViolations,
  gotoStory,
  storyUrl,
  THEMES,
  walkTabOrder,
} from './fixtures/story';

/**
 * The UI-kit checks of cms-admin `e2e/a11y.spec.ts` (AC-15), run on the overview story: the axe
 * matrix (light and dark at 1280px and 375px) and the keyboard walk.
 */
const OVERVIEW_STORY = 'ui-kit--overview';
const WIDTHS = [1280, 375] as const;

test('story URLs turn the addon-a11y auto-run off, so only the test runs axe (AC-15)', () => {
  // Two axe runs in one frame fail with "Axe is already running"; the panel's manual run stays.
  expect(storyUrl(OVERVIEW_STORY, 'dark')).toContain('globals=theme:dark;a11y.manual:!true');
});

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`axe: the UI kit overview story has no serious or critical violations (${theme}, ${width}px, AC-15)`, async ({
      page,
    }) => {
      await gotoStory(page, OVERVIEW_STORY, { theme, width });
      await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible();

      await expectNoBlockingViolations(page, theme);
    });
  }
}

test('keyboard walk on the UI kit reaches every control with visible focus (AC-45)', async ({
  page,
}) => {
  await gotoStory(page, OVERVIEW_STORY, { width: 1280 });
  await expect(page.getByRole('heading', { name: 'UI kit', level: 1 })).toBeVisible();
  // The JSON editors load lazily; walk once every editor has replaced its skeleton.
  await expect(page.locator('[data-slot="json-editor-skeleton"]')).toHaveCount(0);
  await expect(page.locator('[data-slot="json-code-editor"] .cm-content')).toHaveCount(
    await page.locator('[data-slot="json-input"]').count(),
  );

  const stops = await walkTabOrder(page, 200);

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  // Disabled controls are skipped; every other visible control in the story root is a Tab stop.
  const enabled = await page.evaluate<number>(
    `[...document.querySelectorAll('#storybook-root *')].filter(
      (el) => el.tabIndex >= 0 && !el.disabled && el.checkVisibility(),
    ).length`,
  );
  expect(enabled).toBeGreaterThan(0);
  expect(stops.length).toBe(enabled);
});
