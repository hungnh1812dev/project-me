import { expect, type Locator, type Page, test } from '@playwright/test';

import { ADMIN_COPY, contentNewPath } from '../src/Apps.contract';
import { signInAsOwner } from '../src/Session.fixture';
import { CV_PAGE_SLUG } from '../src/E2e.constants';

const richtext = ADMIN_COPY.content.richtext;

const FIELD_LABEL = 'Summary';
const BODY_TEXT = 'Toolbar sample';
const LINK_HREF = 'https://example.com/toolbar';
const SETTLE_MS = 150;

interface Toggle {
  label: string;
  selector: string;
}

const TOGGLES: readonly Toggle[] = [
  { label: richtext.bold, selector: 'strong' },
  { label: richtext.italic, selector: 'em' },
  { label: richtext.underline, selector: 'u' },
  { label: richtext.strike, selector: 's' },
  { label: richtext.code, selector: 'code' },
  { label: richtext.heading, selector: 'h2' },
  { label: richtext.bulletList, selector: 'ul li' },
  { label: richtext.orderedList, selector: 'ol li' },
  { label: richtext.blockquote, selector: 'blockquote' },
];

/** Triple-click selects the typed block only; Select all would also span the trailing empty paragraph. */
async function selectLine(editor: Locator) {
  await expect(async () => {
    await editor.getByText(BODY_TEXT).click({ clickCount: 3 });
    const selected = await editor.evaluate(() => String(getSelection()));
    expect(selected).toBe(BODY_TEXT);
  }).toPass();
}

const button = (toolbar: Locator, label: string) =>
  toolbar.getByRole('button', { name: label, exact: true });

test.describe.serial('richtext toolbar', () => {
  let page: Page;
  let editor: Locator;
  let toolbar: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    await signInAsOwner(page);
    await page.goto(contentNewPath(CV_PAGE_SLUG));
    editor = page.getByRole('textbox', { name: FIELD_LABEL, exact: true });
    toolbar = page.getByRole('toolbar', { name: richtext.toolbar }).first();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  for (const { label, selector } of TOGGLES) {
    test(`${label} toggles on and off and mirrors aria-pressed`, async () => {
      await editor.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Delete');
      await page.keyboard.type(BODY_TEXT);
      await selectLine(editor);
      const toggle = button(toolbar, label);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
      await toggle.click();
      await expect(editor.locator(selector)).toContainText(BODY_TEXT);
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(SETTLE_MS);
      await toggle.click();
      await expect(editor.locator(selector)).toHaveCount(0);
      await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });
  }

  test('link: prompt sets it, cancel changes nothing, empty prompt and Remove link unset it', async () => {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(BODY_TEXT);
    await selectLine(editor);

    const link = button(toolbar, richtext.link);
    const prompts: string[] = [];
    page.once('dialog', (dialog) => {
      prompts.push(dialog.message());
      void dialog.dismiss();
    });
    await link.click();
    await expect(editor.locator('a')).toHaveCount(0);
    expect(prompts).toEqual([richtext.linkPrompt]);

    page.once('dialog', (dialog) => void dialog.accept(LINK_HREF));
    await link.click();
    await expect(editor.locator('a')).toHaveAttribute('href', LINK_HREF);
    await expect(link).toHaveAttribute('aria-pressed', 'true');

    page.once('dialog', (dialog) => void dialog.accept(''));
    await link.click();
    await expect(editor.locator('a')).toHaveCount(0);
    await expect(link).toHaveAttribute('aria-pressed', 'false');

    await selectLine(editor);
    page.once('dialog', (dialog) => void dialog.accept(LINK_HREF));
    await link.click();
    await expect(editor.locator('a')).toHaveCount(1);
    await button(toolbar, richtext.unlink).click();
    await expect(editor.locator('a')).toHaveCount(0);
    await expect(editor).toContainText(BODY_TEXT);
  });
});
