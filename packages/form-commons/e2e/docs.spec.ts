import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The Overview page of each form component (`src/stories/components/*.mdx`): it renders its
 * title, the embedded Default story and the props table, with no page or console error, and axe
 * finds no serious or critical violation in our content.
 */
const FORM_COMPONENTS = [
  ['checkbox', 'Checkbox'],
  ['datatable', 'DataTable'],
  ['datepicker', 'DatePicker'],
  ['input', 'Input'],
  ['jsoninput', 'JsonInput'],
  ['mediainput', 'MediaInput'],
  ['radiogroup', 'RadioGroup'],
  ['rhffield', 'RHFField'],
  ['richtexteditor', 'RichTextEditor'],
  ['select', 'Select'],
  ['switch', 'Switch'],
  ['textarea', 'Textarea'],
] as const;

const docsUrl = (id: string) => `/iframe.html?id=${id}&viewMode=docs&globals=a11y.manual:!true`;

test('every form component has an Overview page, and nothing else does', async ({ request }) => {
  const response = await request.get('/index.json');
  const { entries } = (await response.json()) as {
    entries: Record<string, { type: 'story' | 'docs' }>;
  };
  const docs = Object.entries(entries)
    .filter(([, entry]) => entry.type === 'docs')
    .map(([id]) => id)
    .sort();

  expect(docs).toEqual(FORM_COMPONENTS.map(([slug]) => `components-${slug}--overview`));
});

for (const [slug, title] of FORM_COMPONENTS) {
  test(`the ${title} Overview renders its guide, Default story and props`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto(docsUrl(`components-${slug}--overview`));

    const content = page.locator('.sbdocs-content');
    await expect(content.getByRole('heading', { level: 1, name: title })).toBeVisible({
      timeout: 30_000,
    });
    for (const section of ['When to use', 'Usage', 'Guidelines', 'Accessibility and keyboard']) {
      await expect(content.getByRole('heading', { level: 2, name: section })).toBeVisible();
    }
    // The embedded Default story and the generated props table.
    await expect(content.locator('.docs-story').first()).toBeVisible();
    await expect(content.locator('table.docblock-argstable')).toBeVisible();
    expect(errors).toEqual([]);

    // Our prose and the embedded story; Storybook's own code and table blocks are excluded.
    const results = await new AxeBuilder({ page })
      .include('.sbdocs-content')
      .exclude('.docblock-argstable')
      .exclude('.docblock-source')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const blocking = results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(' ')) }));
    expect(blocking).toEqual([]);
  });
}
