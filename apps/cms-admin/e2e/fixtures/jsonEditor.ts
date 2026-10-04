import type { Locator } from '@playwright/test';

/** The text of a CodeMirror editor content locator, one `\n` per line (it is not a textarea). */
export const editorText = async (content: Locator): Promise<string> =>
  (await content.locator('.cm-line').allTextContents()).join('\n');
