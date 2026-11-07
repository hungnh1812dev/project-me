import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { ADMIN_COPY, contentEditPath, contentNewPath } from '../src/Apps.contract';
import { CV_PAGE_SLUG, HTTP, RUN_ID } from '../src/E2e.constants';
import {
  createCvPage,
  putSummary,
  readDraft,
  removeCvPage,
  watchAccessToken,
  type DraftRef,
} from '../src/RichtextDocument.fixture';
import { signInAsOwner } from '../src/Session.fixture';

const richtext = ADMIN_COPY.content.richtext;

const FIELD_LABEL = 'Summary';
const BODY_TEXT = 'Toolbar sample';
const LINK_HREF = 'https://example.com/toolbar';
const SETTLE_MS = 150;
const TOOLTIP_TIMEOUT_MS = 3_000;
const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
const SEPARATOR_COUNT = 7;
const COLOUR_STYLE = /color:\s*#[0-9a-f]{6}/i;

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

const toolbarNames = (toolbar: Locator) =>
  toolbar.getByRole('button').evaluateAll((items) => items.map((item) => item.ariaLabel));

test.describe.serial('richtext toolbar: icons, groups and tooltips', () => {
  let page: Page;
  let toolbar: Locator;

  test.beforeAll(async ({ browser }) => {
    page = await (await browser.newContext()).newPage();
    await signInAsOwner(page);
    await page.goto(contentNewPath(CV_PAGE_SLUG));
    toolbar = page.getByRole('toolbar', { name: richtext.toolbar }).first();
    await expect(toolbar).toBeVisible();
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('every control is an icon button with an accessible name, in group order', async () => {
    expect(await toolbarNames(toolbar)).toEqual([
      richtext.undo,
      richtext.redo,
      `${richtext.blockType}: ${richtext.paragraph}`,
      richtext.bold,
      richtext.italic,
      richtext.underline,
      richtext.strike,
      richtext.code,
      richtext.textColor,
      richtext.alignLeft,
      richtext.alignCenter,
      richtext.alignRight,
      richtext.alignJustify,
      richtext.bulletList,
      richtext.orderedList,
      richtext.blockquote,
      richtext.codeBlock,
      richtext.horizontalRule,
      richtext.link,
      richtext.unlink,
      richtext.insertImage,
    ]);
    await expect(toolbar.getByRole('separator')).toHaveCount(SEPARATOR_COUNT);
    await expect(toolbar.locator('button svg')).toHaveCount((await toolbarNames(toolbar)).length);
  });

  test('hovering an icon shows its name as a tooltip', async () => {
    for (const label of [richtext.bold, richtext.alignCenter, richtext.insertImage]) {
      await button(toolbar, label).hover();
      await expect(page.getByRole('tooltip')).toHaveText(label, { timeout: TOOLTIP_TIMEOUT_MS });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    }
  });

  test('the block type menu lists the paragraph and six headings', async () => {
    await toolbar.getByRole('button', { name: new RegExp(`^${richtext.blockType}:`) }).click();
    const items = await page.getByRole('menuitem').allInnerTexts();
    expect(items).toEqual([
      richtext.paragraph,
      ...HEADING_LEVELS.map((level) => richtext[`heading${level}`]),
    ]);
    await page.keyboard.press('Escape');
  });

  test('undo and redo start disabled and the keyboard walks the toolbar', async () => {
    await expect(button(toolbar, richtext.undo)).toHaveAttribute('aria-disabled', 'true');
    await expect(button(toolbar, richtext.redo)).toHaveAttribute('aria-disabled', 'true');
    await button(toolbar, richtext.undo).focus();
    await page.keyboard.press('ArrowRight');
    await expect(button(toolbar, richtext.redo)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(toolbar.getByRole('button', { name: /^Text style:/ })).toBeFocused();
  });
});

test.describe.serial('richtext toolbar: formatting survives save and reload', () => {
  let page: Page;
  let editor: Locator;
  let toolbar: Locator;
  let draft: DraftRef;
  let token: () => string;
  let api: APIRequestContext;
  const consoleProblems: string[] = [];

  const lineOf = (text: string) => editor.getByText(text, { exact: true });

  const writeLines = async (lines: readonly string[]) => {
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    for (const [index, line] of lines.entries()) {
      if (index > 0) await page.keyboard.press('Enter');
      await page.keyboard.type(line);
    }
  };

  const saveAndReload = async (): Promise<string> => {
    const before = await editor.innerHTML();
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'PUT' && r.url().includes(draft.documentId),
      ),
      page.getByRole('button', { name: ADMIN_COPY.content.save, exact: true }).click(),
    ]);
    expect(response.ok()).toBe(true);
    await page.reload();
    await expect(editor).toBeVisible();
    return before;
  };

  test.beforeAll(async ({ browser, playwright }) => {
    const context = await browser.newContext();
    page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleProblems.push(message.text());
    });
    page.on('pageerror', (error) => consoleProblems.push(error.message));
    token = watchAccessToken(page);
    await signInAsOwner(page);
    api = await playwright.request.newContext();
    draft = await createCvPage(api, token(), `Toolbar round trip ${RUN_ID}`);
    await page.goto(contentEditPath(CV_PAGE_SLUG, draft.documentId));
    editor = page.getByRole('textbox', { name: FIELD_LABEL, exact: true });
    toolbar = page.getByRole('toolbar', { name: richtext.toolbar }).first();
    await expect(editor).toBeVisible();
  });

  test.afterAll(async () => {
    await removeCvPage(api, token(), draft.documentId);
    await api.dispose();
    await page.context().close();
  });

  test('headings 1 to 6 come back unchanged', async () => {
    const lines = HEADING_LEVELS.map((level) => `Heading line ${level}`);
    await writeLines(lines);
    for (const level of HEADING_LEVELS) {
      await lineOf(`Heading line ${level}`).click();
      const blockTypeButton = toolbar.getByRole('button', {
        name: new RegExp(`^${richtext.blockType}:`),
      });
      await expect(blockTypeButton).toHaveAccessibleName(
        `${richtext.blockType}: ${richtext.paragraph}`,
      );
      await blockTypeButton.click();
      await page.getByRole('menuitem', { name: richtext[`heading${level}`], exact: true }).click();
      await expect(editor.locator(`h${level}`)).toHaveText(`Heading line ${level}`);
      await expect(
        page.getByRole('menuitem', { name: richtext[`heading${level}`], exact: true }),
      ).toBeHidden();
      await expect(blockTypeButton).toHaveAccessibleName(
        `${richtext.blockType}: ${richtext[`heading${level}`]}`,
      );
    }
    const before = await saveAndReload();
    for (const level of HEADING_LEVELS) {
      await expect(editor.locator(`h${level}`)).toHaveText(`Heading line ${level}`);
    }
    expect(await editor.innerHTML()).toBe(before);
    await lineOf('Heading line 3').click();
    await expect(
      toolbar.getByRole('button', { name: `${richtext.blockType}: ${richtext.heading3}` }),
    ).toBeVisible();
  });

  test('a palette colour comes back unchanged and its swatch stays selected', async () => {
    await writeLines(['Coloured line']);
    await lineOf('Coloured line').click({ clickCount: 3 });
    await button(toolbar, richtext.textColor).click();
    await page.getByRole('button', { name: richtext.colors.red, exact: true }).click();
    await expect(editor.locator('span[style*="color"]')).toHaveText('Coloured line');
    const before = await saveAndReload();
    const coloured = editor.locator('span[style*="color"]');
    await expect(coloured).toHaveText('Coloured line');
    expect(await editor.innerHTML()).toBe(before);
    expect((await readDraft(api, token(), draft.documentId)).summary).toMatch(COLOUR_STYLE);

    await lineOf('Coloured line').click();
    await button(toolbar, richtext.textColor).click();
    await expect(
      page.getByRole('button', { name: richtext.colors.red, exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
  });

  test('each alignment comes back unchanged', async () => {
    const alignments = [
      { label: richtext.alignLeft, css: 'left' },
      { label: richtext.alignCenter, css: 'center' },
      { label: richtext.alignRight, css: 'right' },
      { label: richtext.alignJustify, css: 'justify' },
    ] as const;
    await writeLines(alignments.map(({ css }) => `Aligned ${css}`));
    for (const { label, css } of alignments) {
      await lineOf(`Aligned ${css}`).click();
      await expect
        .poll(() =>
          page.evaluate(() => getSelection()?.anchorNode?.parentElement?.closest('p')?.textContent),
        )
        .toBe(`Aligned ${css}`);
      await button(toolbar, label).click();
    }
    // Every alignment must be in the editor before it is saved.
    for (const { css } of alignments.slice(1)) {
      await expect(editor.locator(`[style*="text-align: ${css}"]`)).toHaveCount(1);
    }
    const before = await saveAndReload();
    expect(await editor.innerHTML()).toBe(before);
    const { summary: stored } = await readDraft(api, token(), draft.documentId);
    for (const { css } of alignments.slice(1)) expect(stored).toContain(`text-align: ${css}`);
    for (const { label, css } of alignments) {
      await lineOf(`Aligned ${css}`).click();
      await expect(button(toolbar, label)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('a crafted save keeps no foreign colour, position style, foreign image or handler', async () => {
    const crafted = [
      '<p style="position:fixed;top:0">Pinned</p>',
      '<p><span style="color:#123456">Foreign colour</span></p>',
      '<p style="text-align:center">Centered</p>',
      '<img src="https://evil.example/pixel.png" data-media-id="01a19594-efd9-7504-801c-2b8e85884921">',
      '<img src="x" onerror="window.e2ePwned=1">',
    ].join('');
    const { version } = await readDraft(api, token(), draft.documentId);
    const response = await putSummary(
      api,
      token(),
      { documentId: draft.documentId, version },
      crafted,
    );
    expect(response.status()).toBe(HTTP.OK);
    const { summary: stored } = await readDraft(api, token(), draft.documentId);
    expect(stored).toContain('Centered');
    expect(stored).toContain('text-align: center');
    for (const refused of ['position', '#123456', 'evil.example', 'onerror', 'fixed']) {
      expect(stored.toLowerCase()).not.toContain(refused);
    }
    expect(stored).not.toContain('<img');
  });

  test('the console stayed free of unexpected errors', () => {
    // The sign-in page's first session probe answers 401 and logs "Failed to load resource".
    const unexpected = consoleProblems.filter((text) => !text.includes('Failed to load resource'));
    expect(unexpected).toEqual([]);
  });
});
