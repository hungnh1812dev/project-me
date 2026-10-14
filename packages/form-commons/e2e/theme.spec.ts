import { expect, test } from '@playwright/test';

import { gotoStory, type Theme } from './fixtures/story';

/**
 * The UI-kit colour tests of cms-admin `e2e/theme.spec.ts` (AC-14), with the same titles and
 * expected colours. The theme comes from the Storybook theme global instead of `localStorage`.
 */
const OVERVIEW_STORY = 'ui-kit--overview';
const COLOUR_STORY = 'components-colour--default';

for (const { choice, primary, highlight } of [
  // SPEC colour table: primary #4945FF in both themes, highlight = primary-ink #4945FF / #9A98FF.
  { choice: 'light', primary: 'rgb(73, 69, 255)', highlight: 'rgb(73, 69, 255)' },
  { choice: 'dark', primary: 'rgb(73, 69, 255)', highlight: 'rgb(154, 152, 255)' },
] satisfies { choice: Theme; primary: string; highlight: string }[]) {
  test(`the UI kit shows the primary and highlight swatches and the highlight badge (${choice}, AC-14)`, async ({
    page,
  }) => {
    await gotoStory(page, OVERVIEW_STORY, { theme: choice });
    const colour = page.getByRole('region', { name: 'Colour' });

    await expect(colour.getByText('primary', { exact: true })).toHaveCSS(
      'background-color',
      primary,
    );
    await expect(colour.getByText('highlight', { exact: true })).toHaveCSS(
      'background-color',
      highlight,
    );
    await expect(page.getByRole('region', { name: 'Badge' }).getByText('Highlight')).toHaveCSS(
      'background-color',
      highlight,
    );
  });
}

for (const { choice, swatches } of [
  // SPEC colour table: the swatches added for AC-9, as computed background colours.
  {
    choice: 'light',
    swatches: {
      'primary-ink': 'rgb(73, 69, 255)', // #4945FF
      accent: 'rgb(240, 240, 255)', // #F0F0FF
      border: 'rgb(220, 220, 228)', // #DCDCE4
      input: 'rgb(128, 128, 156)', // #80809C
    },
  },
  {
    choice: 'dark',
    swatches: {
      'primary-ink': 'rgb(154, 152, 255)', // #9A98FF
      accent: 'rgb(50, 50, 77)', // #32324D
      border: 'rgb(50, 50, 77)', // #32324D
      input: 'rgb(142, 142, 169)', // #8E8EA9
    },
  },
] satisfies { choice: Theme; swatches: Record<string, string> }[]) {
  test(`the UI kit labels a swatch for every colour token (${choice}, AC-9)`, async ({ page }) => {
    await gotoStory(page, COLOUR_STORY, { theme: choice });
    const colour = page.getByRole('region', { name: 'Colour' });

    for (const name of [
      'primary',
      'primary-ink',
      'secondary',
      'accent',
      'highlight',
      'destructive',
      'success',
      'warning',
      'muted',
      'border',
      'input',
    ]) {
      await expect(colour.getByText(name, { exact: true })).toBeVisible();
    }
    for (const [name, background] of Object.entries(swatches)) {
      await expect(colour.locator(`[data-swatch="${name}"]`)).toHaveCSS(
        'background-color',
        background,
      );
    }
  });
}
