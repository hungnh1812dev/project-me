import { expect, test } from '@playwright/test';

import { editorText, gotoStory, storyUrl } from './fixtures/story';

/**
 * Port of cms-admin `e2e/inputs.spec.ts` (AC-13). Titles and assertions are unchanged; only the
 * navigation moves from `/admin/dev/ui-kit` to the stories.
 */
const JSON_INPUT_STORY = 'components-jsoninput--all-states';
const OVERVIEW_STORY = 'ui-kit--overview';

test.beforeEach(async ({ page }) => {
  await gotoStory(page, JSON_INPUT_STORY);
  // A cold `storybook dev` transforms modules on the first visits, which can take over 5 s.
  await expect(page.getByRole('textbox', { name: 'Metadata' })).toBeVisible({ timeout: 30_000 });
});

test('invalid JSON shows an error on blur and fixing it clears the error', async ({ page }) => {
  const json = page.getByRole('textbox', { name: 'Metadata' });

  const error = page.getByRole('alert').filter({ hasText: 'Invalid JSON: Expected double-quoted' });
  await json.fill('{"title": "Hello",}');
  await expect(error).toHaveCount(0); // no validation while typing before the first blur
  await json.blur();

  await expect(error).toHaveText(/\(line 1, column 19\)$/);
  await expect(json).toHaveAttribute('aria-invalid', 'true');

  await json.fill('{"title": "Hello"}');

  await expect(error).toHaveCount(0);
  await expect(json).not.toHaveAttribute('aria-invalid');
});

test('a JSON array fails the object check', async ({ page }) => {
  const json = page.getByRole('textbox', { name: 'Metadata' });

  await json.fill('[1, 2]');
  await json.blur();

  await expect(
    page.getByRole('alert').filter({ hasText: 'Expected a JSON object.' }),
  ).toBeVisible();
});

test('Format JSON pretty-prints valid text', async ({ page }) => {
  const json = page.getByRole('textbox', { name: 'Metadata' });
  const format = page
    .locator('[data-slot="field"]', { has: json })
    .getByRole('button', { name: 'Format JSON' });
  await expect(format).toBeDisabled();

  await json.fill('{"a":[1,2]}');
  await format.click();

  await expect.poll(() => editorText(json)).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
});

test('Tab leaves the JSON field (no keyboard trap)', async ({ page }) => {
  const json = page.getByRole('textbox', { name: 'Metadata' });
  await json.fill('{}');

  await page.keyboard.press('Tab');

  await expect(json).not.toBeFocused();
});

test('the JSON editor shows line numbers and highlighted tokens (AC-15)', async ({ page }) => {
  const json = page.getByRole('textbox', { name: 'Settings' });
  const editor = page.locator('repo-json-editor', { has: json });

  await expect(editor.locator('.cm-lineNumbers .cm-gutterElement', { hasText: '1' })).toBeVisible();
  const property = json.locator('span', { hasText: '"theme"' });
  const value = json.locator('span', { hasText: '"dark"' });
  await expect(property).toBeVisible();
  await expect(value).toBeVisible();
  // Property names and string values get different highlight colours.
  const colours = await page.evaluate<string[]>(`(() => {
    const content = [...document.querySelectorAll('repo-json-editor')]
      .map((host) => host.shadowRoot.querySelector('.cm-content'))
      .find((el) => el?.getAttribute('aria-label') === 'Settings');
    return ${JSON.stringify(['"theme"', '"dark"'])}.map((text) => {
      const span = [...content.querySelectorAll('span')].find((s) => s.textContent === text);
      return span ? getComputedStyle(span).color : '';
    });
  })()`);
  expect(colours[0]).not.toBe('');
  expect(colours[0]).not.toBe(colours[1]);
});

test('the skeleton and the mounted editor have the same height (AC-16)', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(/JsonCodeEditor/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(storyUrl(JSON_INPUT_STORY));
  const field = page.locator('[data-slot="json-input"]').first();
  const skeleton = field.locator('[data-slot="json-editor-skeleton"]');
  await expect(skeleton).toBeVisible();
  const before = (await skeleton.boundingBox())!.height;

  release();
  const host = field.locator('repo-json-editor');
  await expect(host.locator('.cm-content')).toBeVisible();
  const after = (await host.boundingBox())!.height;

  expect(Math.abs(after - before)).toBeLessThanOrEqual(2);
});

test('the editor is named by its label and described by the Field text (AC-20)', async ({
  page,
}) => {
  /** Strings, not functions: the e2e tsconfig has no DOM lib. */
  const describedText = (name: string) =>
    page.evaluate<string>(`(() => {
      const el = [...document.querySelectorAll('repo-json-editor')]
        .map((host) => host.shadowRoot.querySelector('.cm-content'))
        .find((content) => content?.getAttribute('aria-label') === ${JSON.stringify(name)});
      return el.getRootNode().getElementById(el.getAttribute('aria-describedby')).textContent;
    })()`);
  await expect(page.getByRole('textbox', { name: 'Invalid JSON', exact: true })).toBeVisible();

  expect(await describedText('Invalid JSON')).toBe('Invalid JSON: Unexpected token "x"');
  expect(await describedText('Metadata')).toBe('A JSON object.');

  const json = page.getByRole('textbox', { name: 'Metadata' });
  await json.fill('[1]');
  await json.blur();
  await expect.poll(() => describedText('Metadata')).toBe('A JSON object. Expected a JSON object.');
});

test('Shift+Tab leaves the JSON field backwards (AC-21)', async ({ page }) => {
  const json = page.getByRole('textbox', { name: 'Settings' });
  await json.click();

  await page.keyboard.press('Shift+Tab');

  // The Metadata Format button before it is disabled (empty text), so focus reaches that editor.
  await expect(json).not.toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Metadata' })).toBeFocused();
});

test('clicking the JSON field label focuses the editor (AC-33)', async ({ page }) => {
  const json = page.getByRole('textbox', { name: 'Settings' });
  await expect(json).toBeVisible();

  await page.locator('label', { hasText: /^Settings$/ }).click();

  await expect(json).toBeFocused();
});

test('read-only and disabled JSON editors are not editable (AC-18, AC-19)', async ({ page }) => {
  const readOnly = page.getByRole('textbox', { name: 'Read-only JSON' });
  const disabled = page.getByRole('textbox', { name: 'Disabled JSON' });
  const formatOf = (json: typeof readOnly) =>
    page.locator('[data-slot="field"]', { has: json }).getByRole('button', { name: 'Format JSON' });

  await expect(readOnly).toHaveAttribute('aria-readonly', 'true');
  await expect(disabled).toHaveAttribute('contenteditable', 'false');
  await expect(formatOf(readOnly)).toBeDisabled();
  await expect(formatOf(disabled)).toBeDisabled();

  await readOnly.click();
  await page.keyboard.type('x');
  expect(await editorText(readOnly)).toBe('{"fixed":true}');

  // Disabled uses the muted background on its host.
  const host = page.locator('repo-json-editor', { has: disabled });
  const muted = await page.evaluate<string>(
    "getComputedStyle(document.documentElement).getPropertyValue('--muted').trim()",
  );
  expect(muted).not.toBe('');
  await expect(host).toHaveClass(/data-disabled:bg-muted/);
  await expect(host).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('disabled controls ignore input', async ({ page }) => {
  // Spans the Input, Textarea, JsonInput and Switch sections, so it uses the overview story.
  await gotoStory(page, OVERVIEW_STORY);
  const input = page.getByRole('textbox', { name: 'Disabled input' });
  const textarea = page.getByRole('textbox', { name: 'Disabled textarea' });
  const json = page.getByRole('textbox', { name: 'Disabled JSON' });
  const toggle = page.getByRole('switch', { name: 'Disabled switch' });

  for (const control of [input, textarea, json, toggle]) await expect(control).toBeDisabled();

  await toggle.click({ force: true });
  await input.click({ force: true });
  await page.keyboard.type('x');

  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(input).toHaveValue('Read only');
  await expect(textarea).toHaveValue('Read only');
});
