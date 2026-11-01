import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentEditPath } from '../src/Apps.contract';
import { HTTP, RUN_ID } from '../src/E2e.constants';
import { pngOf } from '../src/Png.fixture';
import {
  watchAccessToken,
  type DraftRef,
  type UploadedImage,
} from '../src/RichtextDocument.fixture';
import { bearer, signInAsOwner } from '../src/Session.fixture';

const richtext = ADMIN_COPY.content.richtext;
const media = ADMIN_COPY.media;
const insertCopy = media.imageInsert;
const uploadCopy = media.uploadDialog;

const RESUME_SLUG = 'resume';
const SUMMARY_LABEL = 'Summary';
const UPLOAD_SETTLE_MS = 20_000;
const PNG_SEED_RANGE = 200;
const SEED = (Number.parseInt(RUN_ID, 36) % PNG_SEED_RANGE) + 1;
const FILE_NAME = `e2e-chain-${RUN_ID}.png`;
const RESUME_NAME = `E2E media chain ${RUN_ID}`;

interface ResumeRead {
  summary: string | null;
}

/**
 * The whole media chain on one image: upload in the editor dialog, richtext image,
 * save and publish, REST and GraphQL reads, the file route, replace, delete.
 * The resume is not the main one, so the public CV is never touched.
 */
test.describe.serial('media chain: upload to richtext to public read, replace, delete', () => {
  let page: Page;
  let api: APIRequestContext;
  let token: () => string;
  let editor: Locator;
  let draft: DraftRef;
  let file: UploadedImage;
  let urlBefore = '';

  const dialog = () => page.getByRole('dialog');
  const images = () => editor.locator('img[data-media-id]');

  const restSummary = async (status: 'draft' | 'published'): Promise<string> => {
    const response = await api.get(apiUrl(API_PATHS.document(RESUME_SLUG, draft.documentId)), {
      headers: bearer(token()),
      params: { status },
    });
    expect(response.status()).toBe(HTTP.OK);
    const body = (await response.json()) as { values: ResumeRead };
    return body.values.summary ?? '';
  };

  const graphqlSummary = async (): Promise<string | undefined> => {
    const response = await api.post(apiUrl(API_PATHS.GRAPHQL), {
      data: {
        query: `query ($name: String!) { resumeList(filter: { name: { eq: $name } }, pageSize: 1) { data { summary } } }`,
        variables: { name: RESUME_NAME },
      },
    });
    expect(response.status()).toBe(HTTP.OK);
    const body = (await response.json()) as { data: { resumeList: { data: ResumeRead[] } } };
    return body.data.resumeList.data[0]?.summary ?? undefined;
  };

  const mediaItem = async (): Promise<UploadedImage | undefined> => {
    const response = await api.get(apiUrl(API_PATHS.MEDIA), {
      headers: bearer(token()),
      params: { search: FILE_NAME },
    });
    expect(response.status()).toBe(HTTP.OK);
    const { data } = (await response.json()) as { data: UploadedImage[] };
    return data.find((item) => item.id === file.id);
  };

  const publish = async (): Promise<void> => {
    const current = await api.get(apiUrl(API_PATHS.document(RESUME_SLUG, draft.documentId)), {
      headers: bearer(token()),
      params: { status: 'draft' },
    });
    const { version } = (await current.json()) as { version: number };
    const published = await api.post(
      apiUrl(`${API_PATHS.document(RESUME_SLUG, draft.documentId)}/publish`),
      { headers: bearer(token()), data: { expectedVersion: version } },
    );
    expect(published.ok()).toBe(true);
  };

  test.beforeAll(async ({ browser, playwright }) => {
    page = await (await browser.newContext()).newPage();
    token = watchAccessToken(page);
    await signInAsOwner(page);
    api = await playwright.request.newContext();
    const created = await api.post(apiUrl(API_PATHS.documents(RESUME_SLUG)), {
      headers: bearer(token()),
      data: { values: { name: RESUME_NAME, position: 'Chain tester', isMain: false } },
    });
    expect(created.status()).toBe(HTTP.CREATED);
    draft = (await created.json()) as DraftRef;
    await page.goto(contentEditPath(RESUME_SLUG, draft.documentId));
    editor = page.getByRole('textbox', { name: SUMMARY_LABEL, exact: true });
    await expect(editor).toBeVisible();
  });

  test.afterAll(async () => {
    const removed = await api.delete(apiUrl(API_PATHS.document(RESUME_SLUG, draft.documentId)), {
      headers: bearer(token()),
    });
    expect(removed.status()).toBe(HTTP.NO_CONTENT);
    await api.dispose();
    await page.context().close();
  });

  test('upload in the editor dialog inserts a richtext image and saving stores it', async () => {
    await editor.click();
    const toolbar = page.getByRole('toolbar', { name: richtext.toolbar }).first();
    await toolbar.getByRole('button', { name: richtext.insertImage, exact: true }).click();
    await dialog().getByRole('button', { name: insertCopy.upload }).click();
    await dialog()
      .getByTestId('upload-dialog-input')
      .setInputFiles({ name: FILE_NAME, mimeType: 'image/png', buffer: pngOf(SEED) });
    await dialog()
      .getByRole('button', { name: /^Upload/ })
      .click();
    await expect(dialog().getByText(uploadCopy.status.done)).toBeVisible({
      timeout: UPLOAD_SETTLE_MS,
    });
    await dialog().getByRole('button', { name: uploadCopy.close }).click();
    await expect(dialog()).toBeHidden();
    await expect(images()).toHaveCount(1);

    const [saved] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'PUT' && r.url().includes(draft.documentId),
      ),
      page.getByRole('button', { name: ADMIN_COPY.content.save, exact: true }).click(),
    ]);
    expect(saved.ok()).toBe(true);

    const id = await images().first().getAttribute('data-media-id');
    expect(id).toBeTruthy();
    file = { id: id ?? '', fileName: FILE_NAME, url: '' };
    const item = await mediaItem();
    expect(item).toBeDefined();
    urlBefore = item?.url ?? '';
    expect(urlBefore).not.toBe('');
  });

  test('REST draft, REST published and GraphQL show the stored url, and the file route serves it', async () => {
    await publish();
    expect(await restSummary('draft')).toContain(urlBefore);
    expect(await restSummary('published')).toContain(urlBefore);
    expect(await graphqlSummary()).toContain(urlBefore);

    const served = await api.get(urlBefore);
    expect(served.status()).toBe(HTTP.OK);
    expect(served.headers()['content-type']).toContain('image/png');
  });

  test('after replace the new url shows in the editor, REST and GraphQL', async () => {
    await page.goto('/media');
    await page.getByRole('searchbox', { name: media.filters.search }).fill(FILE_NAME);
    const card = page.getByRole('listitem').filter({ hasText: FILE_NAME });
    await card.getByRole('button', { name: media.grid.replaceLabel(FILE_NAME) }).click();
    await dialog()
      .getByTestId('upload-dialog-input')
      .setInputFiles({ name: FILE_NAME, mimeType: 'image/png', buffer: pngOf(SEED + 1) });
    await dialog()
      .getByRole('button', { name: /^Upload/ })
      .click();
    await expect(page.getByText(media.replaced(FILE_NAME))).toBeVisible({
      timeout: UPLOAD_SETTLE_MS,
    });
    const urlAfter = (await mediaItem())?.url ?? '';
    expect(urlAfter).not.toBe('');
    expect(urlAfter).not.toBe(urlBefore);

    expect(await restSummary('published')).toContain(urlAfter);
    expect(await restSummary('published')).not.toContain(urlBefore);
    const graphql = await graphqlSummary();
    expect(graphql).toContain(urlAfter);
    expect(graphql).not.toContain(urlBefore);

    expect((await api.get(urlAfter)).status()).toBe(HTTP.OK);
    await page.goto(contentEditPath(RESUME_SLUG, draft.documentId));
    await expect(editor.locator(`img[src="${urlAfter}"]`)).toHaveCount(1);
    urlBefore = urlAfter;
  });

  test('delete is refused while in use; after the image is removed it deletes and reads lose it', async () => {
    await page.goto('/media');
    await page.getByRole('searchbox', { name: media.filters.search }).fill(FILE_NAME);
    await page.getByRole('button', { name: media.deleteLabel(FILE_NAME) }).click();
    await dialog()
      .getByRole('button', { name: media.deleteDialog.submit(FILE_NAME) })
      .click();
    await expect(dialog()).toContainText(media.errors.inUse);
    await dialog().getByRole('button', { name: media.deleteDialog.cancel }).click();
    await expect(dialog()).toBeHidden();

    const current = await api.get(apiUrl(API_PATHS.document(RESUME_SLUG, draft.documentId)), {
      headers: bearer(token()),
      params: { status: 'draft' },
    });
    const { version } = (await current.json()) as { version: number };
    const cleared = await api.put(apiUrl(API_PATHS.document(RESUME_SLUG, draft.documentId)), {
      headers: bearer(token()),
      data: { version, values: { summary: '<p>No picture</p>' } },
    });
    expect(cleared.ok()).toBe(true);
    await publish();

    await page.getByRole('button', { name: media.deleteLabel(FILE_NAME) }).click();
    await dialog()
      .getByRole('button', { name: media.deleteDialog.submit(FILE_NAME) })
      .click();
    await expect(dialog()).toBeHidden();
    await expect(page.getByRole('listitem').filter({ hasText: FILE_NAME })).toHaveCount(0);

    expect(await mediaItem()).toBeUndefined();
    expect(await restSummary('published')).not.toContain('<img');
    expect(await graphqlSummary()).not.toContain('<img');
    // The file itself is purged later by the media purge job, so the file route is not checked here.
  });
});
