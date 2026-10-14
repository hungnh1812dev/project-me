import { expect, test } from '@playwright/test';

import { gotoStory } from './fixtures/story';

/**
 * Interaction tests for the Playground stories (AC-18). Each story's `play` function toggles the
 * control once on load, so a test first waits for that state, then interacts and checks that the
 * "Value:" readout (synced to the `value` arg through `useArgs`) follows.
 */
const SWITCH_PLAYGROUND = 'components-switch--playground';
const CHECKBOX_PLAYGROUND = 'components-checkbox--playground';
const INPUT_PLAYGROUND = 'components-input--playground';
const PASSWORD_PLAYGROUND = 'components-input--password-playground';
const TEXTAREA_PLAYGROUND = 'components-textarea--playground';
const JSON_INPUT_PLAYGROUND = 'components-jsoninput--playground';

test.beforeEach(async ({ page }) => {
  await gotoStory(page, SWITCH_PLAYGROUND);
  // A cold `storybook dev` transforms modules on the first visits, which can take over 5 s.
  await expect(page.getByRole('switch', { name: 'Notifications' })).toBeVisible({
    timeout: 30_000,
  });
});

test('the Switch Playground readout follows Space and label clicks', async ({ page }) => {
  const toggle = page.getByRole('switch', { name: 'Notifications' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The play function has turned it on.
  await expect(readout).toHaveText('true');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(readout).toHaveText('false');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await page.getByText('Notifications', { exact: true }).click();
  await expect(readout).toHaveText('true');
});

test('the Checkbox Playground readout follows Space and label clicks', async ({ page }) => {
  await gotoStory(page, CHECKBOX_PLAYGROUND);
  const box = page.getByRole('checkbox', { name: 'Subscribe' });
  const readout = page.getByRole('status', { name: 'Value' });
  await expect(readout).toHaveText('true');
  await expect(box).toHaveAttribute('aria-checked', 'true');

  await box.focus();
  await page.keyboard.press('Space');
  await expect(readout).toHaveText('false');
  await expect(box).toHaveAttribute('aria-checked', 'false');

  await page.getByText('Subscribe', { exact: true }).click();
  await expect(readout).toHaveText('true');
});

test('the Input Playground readout follows typing, key by key', async ({ page }) => {
  await gotoStory(page, INPUT_PLAYGROUND);
  const input = page.getByRole('textbox', { name: 'Name' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The play function has typed "Jane".
  await expect(readout).toHaveText('"Jane"');
  await expect(input).toHaveValue('Jane');

  await input.press('End');
  await input.pressSequentially(' Doe');
  await expect(readout).toHaveText('"Jane Doe"');
  await expect(input).toHaveValue('Jane Doe');

  await input.clear();
  await expect(readout).toHaveText('""');
});

test('the PasswordInput Playground readout follows typing and the toggle shows the text', async ({
  page,
}) => {
  await gotoStory(page, PASSWORD_PLAYGROUND);
  const input = page.getByLabel('Password', { exact: true });
  const readout = page.getByRole('status', { name: 'Value' });
  await expect(readout).toHaveText('"s3cret"');
  await expect(input).toHaveAttribute('type', 'password');

  await input.press('End');
  await input.pressSequentially('!!');
  await expect(readout).toHaveText('"s3cret!!"');

  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(input).toHaveAttribute('type', 'text');
  await expect(input).toHaveValue('s3cret!!');
});

test('the Textarea Playground readout and counter follow typing, key by key', async ({ page }) => {
  await gotoStory(page, TEXTAREA_PLAYGROUND);
  const textarea = page.getByRole('textbox', { name: 'Bio' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The play function has typed "Hello".
  await expect(readout).toHaveText('"Hello"');
  await expect(page.getByText('5 / 120')).toBeVisible();

  await textarea.press('End');
  await textarea.press('Enter');
  await textarea.pressSequentially('World');
  await expect(readout).toHaveText('"Hello\\nWorld"');
  await expect(textarea).toHaveValue('Hello\nWorld');
  await expect(page.getByText('11 / 120')).toBeVisible();

  await textarea.clear();
  await expect(readout).toHaveText('""');
  await expect(page.getByText('0 / 120')).toBeVisible();
});

test('the JsonInput Playground readout follows typing, validation and Format JSON', async ({
  page,
}) => {
  await gotoStory(page, JSON_INPUT_PLAYGROUND);
  const editor = page.getByRole('textbox', { name: 'Settings' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The play function has typed "[1]".
  await expect(readout).toHaveText('"[1]"');

  await editor.focus();
  await editor.blur();
  await expect(page.getByRole('alert')).toHaveText('Expected a JSON object.');

  await editor.fill('{"a":1}');
  await expect(readout).toHaveText('"{\\"a\\":1}"');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('button', { name: 'Format JSON' }).click();
  await expect(readout).toHaveText('"{\\n  \\"a\\": 1\\n}"');
});

test('Input Playground args set the initial value and the read-only state', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=components-input--playground&viewMode=story&args=value:Ada;readOnly:!true&globals=a11y.manual:!true',
  );
  const input = page.getByRole('textbox', { name: 'Name' });

  await expect(input).toHaveValue('Ada');
  await expect(input).toHaveAttribute('readonly', '');
  await input.pressSequentially('x');
  await expect(input).toHaveValue('Ada');
  await expect(page.getByRole('status', { name: 'Value' })).toHaveText('"Ada"');
});

test('Playground args set the initial value and state', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=components-checkbox--playground&viewMode=story&args=value:!true;disabled:!true&globals=a11y.manual:!true',
  );
  const box = page.getByRole('checkbox', { name: 'Subscribe' });

  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(box).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('status', { name: 'Value' })).toHaveText('true');
});
