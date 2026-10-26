import { type Page, expect, test } from '@playwright/test';

import { ADMIN_COPY, MEDIA_PAGE_SIZE } from '../src/Apps.contract';
import { signInAsOwner } from '../src/Session.fixture';
import { HTTP } from '../src/E2e.constants';

const copy = ADMIN_COPY.media;
const MEDIA_LIST_PATTERN = /\/api\/v1\/media(\?.*)?$/;
const LAST_PAGE_ROWS = 1;
const TOTAL = MEDIA_PAGE_SIZE + LAST_PAGE_ROWS;

function fakeFile(index: number) {
  return {
    id: crypto.randomUUID(),
    fileName: `adapter-${index}.png`,
    mimeType: 'image/png',
    size: 68,
    width: 1,
    height: 1,
    alt: null,
    url: '',
    thumbnailUrl: null,
    isReviewerPreset: false,
    createdAt: new Date().toISOString(),
  };
}

async function serveMediaList(
  page: Page,
  rowsOnPage: (pageNumber: number) => number,
  total: number,
) {
  await page.route(MEDIA_LIST_PATTERN, async (route) => {
    const request = route.request();
    const headers = {
      'access-control-allow-origin': request.headers()['origin'] ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers':
        request.headers()['access-control-request-headers'] ?? '*',
    };
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: HTTP.NO_CONTENT, headers });
    }
    if (request.method() !== 'GET') return route.continue();
    const pageNumber = Number(
      new URL(request.url()).searchParams.get('page') ?? '1',
    );
    return route.fulfill({
      status: HTTP.OK,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        data: Array.from({ length: rowsOnPage(pageNumber) }, (_, i) =>
          fakeFile(i),
        ),
        meta: { page: pageNumber, pageSize: MEDIA_PAGE_SIZE, total },
      }),
    });
  });
}

test('the media list pages with the kit paginator: range, Previous / Next and disabled ends', async ({
  page,
}) => {
  await serveMediaList(
    page,
    (pageNumber) => (pageNumber === 1 ? MEDIA_PAGE_SIZE : LAST_PAGE_ROWS),
    TOTAL,
  );
  await signInAsOwner(page);
  await page.goto('/media');

  const nav = page.getByRole('navigation', { name: copy.pagination.label });
  const previous = nav.getByRole('button', { name: copy.pagination.previous });
  const next = nav.getByRole('button', { name: copy.pagination.next });
  await expect(nav).toContainText(
    copy.pagination.range(1, MEDIA_PAGE_SIZE, TOTAL),
  );
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(nav).toContainText(copy.pagination.range(TOTAL, TOTAL, TOTAL));
  await expect(next).toBeDisabled();
  await expect(previous).toBeEnabled();

  await previous.click();
  await expect(nav).toContainText(
    copy.pagination.range(1, MEDIA_PAGE_SIZE, TOTAL),
  );
});
