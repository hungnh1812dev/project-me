import { expect, test } from '@playwright/test';

import { gotoStory } from './fixtures/story';

/**
 * Interaction tests for the Playground stories (AC-18). Each story's `play` function toggles the
 * control once on load, so a test first waits for that state, then interacts and checks that the
 * "Value:" readout (synced to the `value` arg through `useArgs`) follows.
 */
const SWITCH_PLAYGROUND = 'components-switch--playground';
const CHECKBOX_PLAYGROUND = 'components-checkbox--playground';

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

test('Playground args set the initial value and state', async ({ page }) => {
  await page.goto(
    '/iframe.html?id=components-checkbox--playground&viewMode=story&args=value:!true;disabled:!true&globals=a11y.manual:!true',
  );
  const box = page.getByRole('checkbox', { name: 'Subscribe' });

  await expect(box).toHaveAttribute('aria-checked', 'true');
  await expect(box).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('status', { name: 'Value' })).toHaveText('true');
});
