import { expect, test, type Page } from '@playwright/test';

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
  // So do the rich text editors.
  await expect(page.locator('[data-slot="rich-text-skeleton"]')).toHaveCount(0);

  const stops = await walkTabOrder(page, 200);

  expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
  // Disabled controls are skipped; every other visible control in the story root is a Tab stop,
  // except links inside editable rich text, which the browser edits rather than tabs to.
  const enabled = await page.evaluate<number>(
    `[...document.querySelectorAll('#storybook-root *')].filter(
      (el) => el.tabIndex >= 0 && !el.disabled && el.checkVisibility()
        && !el.parentElement?.closest('[contenteditable="true"]'),
    ).length`,
  );
  expect(enabled).toBeGreaterThan(0);
  expect(stops.length).toBe(enabled);
});

/**
 * The input stories (AC-18): every Playground, the RadioGroup `WithItems` story and the RHFField
 * form. Each `play` function changes the value on load, so `settled` waits for its end state
 * before axe runs or the keyboard walk starts.
 */
interface InputStory {
  id: string;
  settled: (page: Page) => Promise<void>;
}

const readoutIs = (text: string | RegExp) => async (page: Page) => {
  await expect(page.getByRole('status', { name: 'Value' })).toHaveText(text, { timeout: 30_000 });
};

const INPUT_STORIES: readonly InputStory[] = [
  { id: 'components-switch--playground', settled: readoutIs('true') },
  { id: 'components-checkbox--playground', settled: readoutIs('true') },
  { id: 'components-input--playground', settled: readoutIs('"Jane"') },
  { id: 'components-input--password-playground', settled: readoutIs('"s3cret"') },
  { id: 'components-textarea--playground', settled: readoutIs('"Hello"') },
  {
    id: 'components-jsoninput--playground',
    settled: async (page) => {
      await readoutIs('"[1]"')(page);
      await expect(page.locator('[data-slot="json-editor-skeleton"]')).toHaveCount(0);
    },
  },
  {
    id: 'components-richtexteditor--playground',
    settled: readoutIs('"<h2>Hello world</h2>"'),
  },
  {
    id: 'components-datatable--playground',
    settled: readoutIs('{"orderBy":"views","sortDir":"desc","selected":[]}'),
  },
  { id: 'components-select--playground', settled: readoutIs('"1d"') },
  { id: 'components-radiogroup--playground', settled: readoutIs('"compact"') },
  { id: 'components-radiogroup--with-items', settled: readoutIs('"scale"') },
  {
    id: 'components-datepicker--playground',
    settled: async (page) => {
      await expect(page.getByRole('button', { name: 'Publish date' })).toHaveText(/Jan 20, 2026/, {
        timeout: 30_000,
      });
      await expect(page.getByRole('dialog', { name: 'Choose a date' })).toHaveCount(0);
    },
  },
  {
    id: 'components-rhffield--form',
    settled: async (page) => {
      // The play function has submitted the empty form.
      await expect(page.getByRole('form', { name: 'Settings' }).getByRole('alert')).toHaveCount(3, {
        timeout: 30_000,
      });
      await expect(page.locator('[data-slot="json-editor-skeleton"]')).toHaveCount(0);
    },
  },
];

for (const story of INPUT_STORIES) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`axe: ${story.id} has no serious or critical violations (${theme}, ${width}px, AC-18)`, async ({
        page,
      }) => {
        await gotoStory(page, story.id, { theme, width });
        await story.settled(page);

        await expectNoBlockingViolations(page, theme);
      });
    }
  }

  test(`keyboard walk on ${story.id} reaches every control with visible focus (AC-18)`, async ({
    page,
  }) => {
    await gotoStory(page, story.id, { width: 1280 });
    await story.settled(page);
    // The play left focus inside the story; restart the walk from a sentinel before the root.
    await page.evaluate(`(() => {
      const start = document.createElement('button');
      start.dataset.walkStart = '';
      start.textContent = 'start';
      document.body.prepend(start);
      start.focus();
    })()`);

    const stops = await walkTabOrder(page, 100);

    expect(stops.length).toBeGreaterThan(0);
    expect(stops.filter((s) => !s.visibleFocus)).toEqual([]);
    const enabled = await page.evaluate<number>(
      `[...document.querySelectorAll('#storybook-root *')].filter(
        (el) => el.tabIndex >= 0 && !el.disabled && el.checkVisibility(),
      ).length`,
    );
    expect(stops.length).toBe(enabled);
  });
}
