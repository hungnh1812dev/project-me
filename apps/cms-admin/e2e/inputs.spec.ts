import { editorText } from './fixtures/jsonEditor.ts';
import { expect, test } from './fixtures/mockApi.ts';

test.beforeEach(async ({ page, mockApi }) => {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe' });
  mockApi.signInAs('jane@example.com');
  await page.goto('/admin/dev/ui-kit');
  await expect(page.getByRole('heading', { name: 'UI kit', level: 1 })).toBeVisible();
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

test('Space toggles a Switch and clicking its label toggles it back', async ({ page }) => {
  const toggle = page.getByRole('switch', { name: 'Notifications' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');

  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await page.getByText('Notifications', { exact: true }).click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
});

test('the password toggle shows and hides the password', async ({ page }) => {
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('s3cret');
  await expect(password).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'Show password' }).click();

  await expect(password).toHaveAttribute('type', 'text');
  await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: 'Hide password' }).click();

  await expect(password).toHaveAttribute('type', 'password');
});

test('the Textarea counter follows typing', async ({ page }) => {
  const bio = page.getByRole('textbox', { name: 'Bio' });

  await bio.fill('Hello');

  await expect(page.getByText('5 / 120')).toBeVisible();
});

test('disabled controls ignore input', async ({ page }) => {
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

test('invalid controls carry aria-invalid with visible error text', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(
    page.getByRole('alert').filter({ hasText: 'Enter a valid email address.' }),
  ).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Accept terms' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
});

test('keyboard focus shows a solid ring-coloured outline', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Name', exact: true }).click();
  await page.keyboard.press('Tab');

  const username = page.getByRole('textbox', { name: 'Username' });
  await expect(username).toBeFocused();
  await expect(username).toHaveCSS('outline-style', 'solid');
});

test('a Dialog is modal, moves focus inside, closes on Escape and returns focus', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: 'Open dialog' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Rename item' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('textbox', { name: 'Item name' })).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('an AlertDialog is a modal alertdialog that closes from Cancel', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'Open alert dialog' });
  await trigger.click();

  const dialog = page.getByRole('alertdialog', { name: 'Delete item?' });
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('a Select in a Field is labelled and picks an option with the keyboard', async ({ page }) => {
  const select = page.getByRole('combobox', { name: 'Expires in' });
  await expect(select).toHaveText(/1 day/);

  await select.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('option', { name: '1 year' }).click();

  await expect(select).toHaveText(/1 year/);
  await expect(select).toBeFocused();
});

test('button classes from @repo/ui reach the app stylesheet', async ({ page }) => {
  // Classes used only inside packages/ui go missing unless globals.css adds an @source for it.
  const destructive = page.getByRole('button', { name: 'destructive', exact: true });
  await expect(destructive).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const icon = page.getByRole('button', { name: 'Add item' });
  await expect(icon).toHaveCSS('width', '36px'); // `lg:size-9` at the 1280px desktop viewport
});

test('the Button roles section shows action, normal and danger in every state (AC-8)', async ({
  page,
}) => {
  const roles = page.getByRole('region', { name: 'Button roles' });
  await expect(roles).toBeVisible();

  for (const role of ['Action', 'Normal', 'Danger']) {
    const idle = roles.getByRole('button', { name: role, exact: true });
    await expect(idle).toBeEnabled();
    await expect(
      roles.getByRole('button', { name: `${role} disabled`, exact: true }),
    ).toBeDisabled();
    const busy = roles.getByRole('button', { name: `${role} loading`, exact: true });
    await expect(busy).toHaveAttribute('aria-busy', 'true');
    await expect(busy).toHaveAttribute('aria-disabled', 'true');

    // Hover changes the fill and keyboard focus draws the ring outline.
    const before = await idle.evaluate(
      (el) => el.ownerDocument.defaultView!.getComputedStyle(el).backgroundColor,
    );
    await idle.hover();
    await expect(idle).not.toHaveCSS('background-color', before);
    await idle.focus();
    await expect(idle).toHaveCSS('outline-style', 'solid');
  }

  // Action is the gold fill with the primary-ink border, Danger the destructive fill.
  const action = roles.getByRole('button', { name: 'Action', exact: true });
  await expect(action).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
  const danger = roles.getByRole('button', { name: 'Danger', exact: true });
  await expect(danger).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
});

test('the Badge section shows the destructive badge (AC-9)', async ({ page }) => {
  const badges = page.getByRole('region', { name: 'Badge' });
  await expect(badges.getByText('destructive', { exact: true })).toBeVisible();
});
