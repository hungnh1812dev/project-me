import { chromium, type FullConfig } from '@playwright/test';

/**
 * Warms a freshly started Storybook before the tests run. The first visit transforms every
 * component and runs `react-docgen-typescript` (about 17 s cold), which would otherwise land on
 * whichever tests start first and time them out.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) return;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    // The overview imports every section, so one visit compiles almost the whole graph.
    await page.goto(`${baseURL}/iframe.html?id=ui-kit--overview&viewMode=story`);
    await page.getByRole('heading', { level: 1, name: 'UI kit' }).waitFor({ timeout: 120_000 });
    // The rich text and JSON editors are lazy chunks; wait until they have loaded too.
    await page
      .locator('[data-slot="rich-text-editor"] [contenteditable]')
      .first()
      .waitFor({ timeout: 120_000 });
    await page.locator('[data-slot="json-code-editor"]').first().waitFor({ timeout: 120_000 });
    await page.goto(`${baseURL}/iframe.html?id=components-select--overview&viewMode=docs`);
    await page.locator('.sbdocs-content h1').waitFor({ timeout: 120_000 });
  } finally {
    await browser.close();
  }
}
