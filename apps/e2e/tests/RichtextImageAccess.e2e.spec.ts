import { expect, test, type Page } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { ADMIN_COPY, contentNewPath } from '../src/Apps.contract';
import { CV_PAGE_SLUG } from '../src/E2e.constants';
import { signInAsOwnerWithRole } from '../src/Session.fixture';

const richtext = ADMIN_COPY.content.richtext;
const EDITOR_ROLE = 'editor';
const CONTENT_ACTIONS = ['read', 'create', 'update'];

interface RoleRow {
  slug: string;
  permissions: Record<string, unknown>[];
}

/** Answers `GET /roles` with the editor role limited to cv-page rights, or left as seeded. */
async function serveEditorPermissions(page: Page, mediaAllowed: boolean): Promise<void> {
  await page.route(apiUrl(API_PATHS.ROLES), async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { data: RoleRow[] };
    const data = mediaAllowed
      ? body.data
      : body.data.map((role) =>
          role.slug === EDITOR_ROLE
            ? {
                ...role,
                permissions: CONTENT_ACTIONS.map((action) => ({
                  subject: CV_PAGE_SLUG,
                  action,
                  readableFields: null,
                  writableFields: null,
                  conditions: null,
                })),
              }
            : role,
        );
    await route.fulfill({ response, json: { ...body, data } });
  });
}

test.describe(
  'richtext image button follows the media read right',
  { tag: ['@cms-admin', '@cms-api', '@content-editing', '@media'] },
  () => {
    test('hidden, and no media request, without media:read', async ({ page }) => {
      const mediaRequests: string[] = [];
      page.on('request', (request) => {
        if (request.url().startsWith(apiUrl(API_PATHS.MEDIA))) mediaRequests.push(request.url());
      });
      await serveEditorPermissions(page, false);
      await signInAsOwnerWithRole(page, EDITOR_ROLE);
      await page.goto(contentNewPath(CV_PAGE_SLUG));
      const toolbar = page.getByRole('toolbar', { name: richtext.toolbar }).first();
      await expect(toolbar).toBeVisible();
      await expect(
        toolbar.getByRole('button', { name: richtext.insertImage, exact: true }),
      ).toHaveCount(0);
      expect(mediaRequests).toEqual([]);
    });

    test('shown with media:read', async ({ page }) => {
      await serveEditorPermissions(page, true);
      await signInAsOwnerWithRole(page, EDITOR_ROLE);
      await page.goto(contentNewPath(CV_PAGE_SLUG));
      const toolbar = page.getByRole('toolbar', { name: richtext.toolbar }).first();
      await expect(
        toolbar.getByRole('button', { name: richtext.insertImage, exact: true }),
      ).toBeVisible();
    });
  },
);
