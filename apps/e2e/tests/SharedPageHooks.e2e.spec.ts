import {
  type BrowserContext,
  expect,
  type Route,
  test,
} from '@playwright/test';

import { ADMIN_COPY, MEDIA_PAGE_SIZE } from '../src/AppContracts.contract';
import { signInAsOwner } from '../src/Session.fixture';
import { HTTP } from '../src/E2e.constants';

const copy = ADMIN_COPY.media;

const MEDIA_API_PATTERN = /\/api\/v1\/media(\/[0-9a-f-]+)?(\?.*)?$/;
const FILE_COUNT = MEDIA_PAGE_SIZE + 1;
const nameOf = (index: number) => `hooks-${index}.png`;

interface FakeFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  alt: string | null;
  url: string;
  thumbnailUrl: string | null;
  isReviewerPreset: boolean;
  createdAt: string;
}

const cors = (route: Route): Record<string, string> => {
  const request = route.request();
  return {
    'access-control-allow-origin': request.headers()['origin'] ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      request.headers()['access-control-request-headers'] ?? '*',
  };
};

/** A paged in-memory /media with one more file than fits on a page. */
async function pagedMediaApi(
  context: BrowserContext,
  requestedPages: number[],
) {
  const files: FakeFile[] = Array.from({ length: FILE_COUNT }, (_, index) => ({
    id: crypto.randomUUID(),
    fileName: nameOf(index),
    mimeType: 'image/png',
    size: 68,
    width: 1,
    height: 1,
    alt: null,
    url: '',
    thumbnailUrl: null,
    isReviewerPreset: false,
    createdAt: new Date().toISOString(),
  }));
  await context.route(MEDIA_API_PATTERN, async (route) => {
    const request = route.request();
    const headers = cors(route);
    const method = request.method();
    if (method === 'OPTIONS') {
      return route.fulfill({ status: HTTP.NO_CONTENT, headers });
    }
    if (method === 'GET') {
      const url = new URL(request.url());
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      requestedPages.push(pageNumber);
      const start = (pageNumber - 1) * MEDIA_PAGE_SIZE;
      return route.fulfill({
        status: HTTP.OK,
        contentType: 'application/json',
        headers,
        body: JSON.stringify({
          data: files.slice(start, start + MEDIA_PAGE_SIZE),
          meta: {
            page: pageNumber,
            pageSize: MEDIA_PAGE_SIZE,
            total: files.length,
          },
        }),
      });
    }
    const id = new URL(request.url()).pathname.split('/').at(-1) ?? '';
    const index = files.findIndex((file) => file.id === id);
    if (method === 'DELETE' && index >= 0) files.splice(index, 1);
    return route.fulfill({ status: HTTP.NO_CONTENT, headers });
  });
}

test('deleting the only row of the last page steps back and focus goes to the heading', async ({
  browser,
}) => {
  const requestedPages: number[] = [];
  const context = await browser.newContext();
  try {
    await pagedMediaApi(context, requestedPages);
    const page = await context.newPage();
    await signInAsOwner(page);
    await page.goto('/media');

    await page.getByRole('button', { name: copy.pagination.next }).click();
    const lastName = nameOf(FILE_COUNT - 1);
    await expect(
      page.getByRole('row').filter({ hasText: lastName }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: copy.deleteLabel(lastName) })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: copy.deleteDialog.submit(lastName) })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // The page steps back: the first file shows again, no empty page 2.
    await expect(
      page.getByRole('row').filter({ hasText: nameOf(0) }),
    ).toBeVisible();
    expect(requestedPages.at(-1)).toBe(1);
    await expect(
      page.getByRole('heading', { level: 1, name: copy.title }),
    ).toBeFocused();
  } finally {
    await context.close();
  }
});
