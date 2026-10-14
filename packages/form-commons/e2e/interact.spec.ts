import { expect, test } from '@playwright/test';

import { LINK_ERROR } from '../src/lib/richtext';
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
const RICH_TEXT_PLAYGROUND = 'components-richtexteditor--playground';
const SELECT_PLAYGROUND = 'components-select--playground';
const DATA_TABLE_PLAYGROUND = 'components-datatable--playground';
const MEDIA_INPUT_PLAYGROUND = 'components-mediainput--playground';
const RADIO_GROUP_PLAYGROUND = 'components-radiogroup--playground';
const RADIO_GROUP_WITH_ITEMS = 'components-radiogroup--with-items';
const DATE_PICKER_PLAYGROUND = 'components-datepicker--playground';
const RHF_FIELD_FORM = 'components-rhffield--default';

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

test('the RichTextEditor Playground readout follows typing, toolbar marks and links', async ({
  page,
}) => {
  await gotoStory(page, RICH_TEXT_PLAYGROUND);
  const editor = page.getByRole('textbox', { name: 'Body' });
  const readout = page.getByRole('status', { name: 'Value' });
  const toolbar = page.getByRole('toolbar', { name: 'Body formatting' });
  // The play function has turned the paragraph into a heading.
  await expect(readout).toHaveText('"<h2>Hello world</h2>"');

  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('More');
  await expect(readout).toHaveText('"<h2>Hello world</h2><p>More</p>"');

  for (let i = 0; i < 'More'.length; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await toolbar.getByRole('button', { name: 'Bold' }).click();
  await expect(readout).toHaveText('"<h2>Hello world</h2><p><strong>More</strong></p>"');

  await toolbar.getByRole('button', { name: 'Link' }).click();
  const url = page.getByRole('textbox', { name: 'Link URL' });
  await url.fill('javascript:alert(1)');
  await url.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(LINK_ERROR);
  await url.fill('https://example.com');
  await url.press('Enter');
  await expect(readout).toHaveText(
    '"<h2>Hello world</h2><p><a href=\\"https://example.com\\"><strong>More</strong></a></p>"',
  );
});

test('the DataTable Playground readout and rows follow sorting and selection', async ({ page }) => {
  await gotoStory(page, DATA_TABLE_PLAYGROUND);
  const table = page.getByRole('table', { name: 'Blog post entries' });
  const readout = page.getByRole('status', { name: 'Value' });
  const titles = () => table.locator('tbody tr td:nth-child(2)').allTextContents();
  // The play function has sorted by Views.
  await expect(readout).toHaveText('{"orderBy":"views","sortDir":"desc","selected":[]}');
  expect((await titles())[0]).toBe('Hello world');

  await page.getByRole('checkbox', { name: 'Select Hello world' }).click();
  await expect(readout).toHaveText('{"orderBy":"views","sortDir":"desc","selected":["post-1"]}');

  await page.getByRole('button', { name: 'Views' }).click();
  await expect(readout).toHaveText('{"orderBy":"views","sortDir":"asc","selected":["post-1"]}');
  await expect(page.getByRole('columnheader', { name: 'Views' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  expect((await titles())[0]).toBe('Draft: spring roadmap');

  const all = page.getByRole('checkbox', { name: 'Select all entries on this page' });
  await expect(all).toHaveAttribute('aria-checked', 'mixed');
  await all.focus();
  await page.keyboard.press('Space');
  await expect(readout).toHaveText(
    '{"orderBy":"views","sortDir":"asc","selected":["post-3","post-2","post-4","post-1"]}',
  );
  await page.keyboard.press('Space');
  await expect(readout).toHaveText('{"orderBy":"views","sortDir":"asc","selected":[]}');
});

test('the MediaInput Playground readout follows the picker, Remove and an upload', async ({
  page,
}) => {
  await gotoStory(page, MEDIA_INPUT_PLAYGROUND);
  const group = page.getByRole('group', { name: 'Cover image' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The play function has chosen logo.png.
  await expect(readout).toHaveText(/"fileName":"logo\.png"/);
  await expect(group.getByRole('img', { name: 'logo.png' })).toBeVisible();
  await expect(group.getByText('512 × 512')).toBeVisible();

  // Search, then pick with the keyboard alone.
  await group.getByRole('button', { name: 'Choose Cover image' }).click();
  const dialog = page.getByRole('dialog', { name: 'Choose cover image' });
  await dialog.getByRole('searchbox', { name: 'Search files' }).fill('team');
  await expect(dialog.getByRole('radio')).toHaveCount(1);
  await dialog.getByRole('radio', { name: 'team-photo.jpg' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(readout).toHaveText(/"fileName":"team-photo\.jpg"/);

  await group.getByRole('button', { name: 'Remove Cover image' }).click();
  await expect(readout).toHaveText('null');
  await expect(group.getByRole('button', { name: 'Choose Cover image' })).toBeFocused();

  // An upload through the provider becomes the choice.
  await group.getByRole('button', { name: 'Choose Cover image' }).click();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'fresh.png',
    mimeType: 'image/png',
    buffer: Buffer.from('png'),
  });
  await expect(dialog.getByText('1 of 1 file uploaded.')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'fresh.png' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await dialog.getByRole('button', { name: 'Select' }).click();
  await expect(readout).toHaveText(/"fileName":"fresh\.png"/);
});

test('the Select Playground readout follows options picked by mouse and keyboard', async ({
  page,
}) => {
  await gotoStory(page, SELECT_PLAYGROUND);
  const select = page.getByRole('combobox', { name: 'Expires in' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The play function has picked "1 day".
  await expect(readout).toHaveText('"1d"');
  await expect(select).toHaveText(/1 day/);

  await select.click();
  await page.getByRole('option', { name: '1 hour' }).click();
  await expect(readout).toHaveText('"1h"');
  await expect(select).toHaveText(/1 hour/);

  await select.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  // Base UI highlights the selected option as the popup opens but moves focus onto it a frame
  // later; until then the keys still go to the trigger, so wait for the popup to own focus.
  const current = page.getByRole('option', { name: '1 hour' });
  await expect(current).toHaveAttribute('data-highlighted');
  await expect(current).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: '1 day' })).toHaveAttribute('data-highlighted');
  await page.keyboard.press('Enter');
  await expect(readout).toHaveText('"1d"');
  await expect(select).toBeFocused();
});

test('the RadioGroup Playground readout follows arrow keys and label clicks', async ({ page }) => {
  await gotoStory(page, RADIO_GROUP_PLAYGROUND);
  const group = page.getByRole('radiogroup', { name: 'Density' });
  const compact = group.getByRole('radio', { name: 'Compact' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The play function has picked Compact.
  await expect(readout).toHaveText('"compact"');
  await expect(compact).toHaveAttribute('aria-checked', 'true');

  await compact.focus();
  await page.keyboard.press('ArrowDown');
  await expect(readout).toHaveText('"spacious"');
  await expect(group.getByRole('radio', { name: 'Spacious' })).toBeFocused();

  await page.getByText('Comfortable', { exact: true }).click();
  await expect(readout).toHaveText('"comfortable"');
  await expect(group.getByRole('radio', { name: 'Comfortable' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('the RadioGroup WithItems readout follows arrow keys and card clicks', async ({ page }) => {
  await gotoStory(page, RADIO_GROUP_WITH_ITEMS);
  const group = page.getByRole('radiogroup', { name: 'Plan' });
  const scale = group.getByRole('radio', { name: 'Scale' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The play function has picked Scale.
  await expect(readout).toHaveText('"scale"');
  await expect(scale).toHaveAttribute('aria-checked', 'true');

  await scale.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(readout).toHaveText('"team"');
  await expect(group.getByRole('radio', { name: 'Team' })).toBeFocused();

  await page.getByText('1 site, 10 GB media').click();
  await expect(readout).toHaveText('"starter"');
  await expect(group.getByRole('radio', { name: 'Starter' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('the DatePicker Playground readout follows days picked by mouse, keyboard and Clear', async ({
  page,
}) => {
  await gotoStory(page, DATE_PICKER_PLAYGROUND);
  const trigger = page.getByRole('button', { name: 'Publish date' });
  const readout = page.getByRole('status', { name: 'Value' });
  // The readout is `JSON.stringify` of a local-midnight Date, so compute it in the page's zone.
  const readoutOf = (day: number) =>
    page.evaluate((d) => JSON.stringify(new Date(2026, 0, d)), day);
  // The play function has picked Jan 20, 2026.
  await expect(readout).toHaveText(await readoutOf(20));
  await expect(trigger).toHaveText(/Jan 20, 2026/);

  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'Choose a date' });
  await calendar.locator('[data-day="2026-01-08"] button').click();
  await expect(readout).toHaveText(await readoutOf(8));
  await expect(trigger).toHaveText(/Jan 8, 2026/);
  await expect(trigger).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(calendar).toBeVisible();
  await expect(calendar.locator('[data-day="2026-01-08"] button')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(readout).toHaveText(await readoutOf(15));
  await expect(trigger).toBeFocused();

  await page.getByRole('button', { name: 'Clear date' }).click();
  await expect(readout).toHaveText('undefined');
  await expect(trigger).toHaveText(/Pick a date/);
});

test('the RHFField form shows the errors on empty submit and the values on valid submit', async ({
  page,
}) => {
  await gotoStory(page, RHF_FIELD_FORM);
  const form = page.getByRole('form', { name: 'Settings' });
  const title = form.getByRole('textbox', { name: 'Title' });
  const submitted = page.getByRole('status', { name: 'Submitted values' });
  // The play function has submitted the empty form.
  await expect(form.getByRole('alert')).toHaveText([
    'Enter a title.',
    'Pick an expiry.',
    'This field is required.',
  ]);
  await expect(title).toHaveAttribute('aria-invalid', 'true');
  await expect(submitted).toHaveText('Nothing submitted yet.');

  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(form.getByRole('alert')).toHaveCount(3);
  await expect(submitted).toHaveText('Nothing submitted yet.');

  await title.fill('Launch');
  await form.getByRole('switch', { name: 'Notifications' }).click();
  await form.getByRole('combobox', { name: 'Expires in' }).click();
  await page.getByRole('option', { name: '1 day' }).click();
  const editor = form.getByRole('textbox', { name: 'Metadata' });
  await editor.fill('[1]');
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(form.getByRole('alert')).toHaveText(['Expected a JSON object.']);
  await expect(submitted).toHaveText('Nothing submitted yet.');

  await editor.fill('{"a":1}');
  await form.getByRole('button', { name: 'Submit' }).click();
  await expect(form.getByRole('alert')).toHaveCount(0);
  await expect(submitted).toHaveText(
    JSON.stringify(
      { title: 'Launch', notifications: true, expires: '1d', metadata: '{"a":1}' },
      null,
      2,
    ),
  );
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
