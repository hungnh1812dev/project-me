import { expect, test } from '@playwright/test';

import { gotoStory } from './fixtures/story';

/**
 * Smoke test (AC-12): every story in the index renders something, without the Storybook error
 * display, an uncaught page error or a console error.
 */
interface IndexEntry {
  id: string;
  type: 'story' | 'docs';
}

test('every story renders without errors (AC-12)', async ({ page, request }) => {
  const response = await request.get('/index.json');
  expect(response.ok()).toBe(true);
  const { entries } = (await response.json()) as { entries: Record<string, IndexEntry> };
  const ids = Object.values(entries)
    .filter((entry) => entry.type === 'story')
    .map((entry) => entry.id);
  expect(ids.length).toBeGreaterThan(0);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });

  for (const id of ids) {
    await test.step(id, async () => {
      errors.length = 0;
      await gotoStory(page, id);

      await expect(page.locator('#storybook-root')).not.toBeEmpty();
      await expect(page.locator('.sb-errordisplay')).toBeHidden();
      expect(errors, id).toEqual([]);
    });
  }
});
