import { expect, test, type APIRequestContext } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP, PAGE_CV_A_SLUG } from '../src/E2e.constants';
import { e2eEnv } from '../src/E2e.env';

/**
 * apps/web `/cv` Education section (repeatable `educations`): several entries in order, one
 * entry, none. Each case publishes its own newest main page-cv-a and removes it afterwards.
 */
test.describe('cv educations', { tag: ['@web', '@cms-api', '@public-site'] }, () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const EDUCATION_HEADING = 'Education';
  const cvUrl = `${e2eEnv.webUrl}/cv`;
  let ownerToken = '';
  const ownerHeaders = () => ({ authorization: `Bearer ${ownerToken}` });

  test.beforeAll(async ({ request }) => {
    const login = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
      data: { email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword },
    });
    ownerToken = ((await login.json()) as { accessToken: string }).accessToken;
  });

  const withMainCv = async (
    request: APIRequestContext,
    degrees: string[],
    check: () => Promise<void>,
  ): Promise<void> => {
    const created = await request.post(apiUrl(API_PATHS.documents(PAGE_CV_A_SLUG)), {
      headers: ownerHeaders(),
      data: {
        values: { name: `E2E Edu CV ${Date.now()}`, position: 'E2E', isMain: true },
        components: {
          educations: degrees.map((degree) => ({
            values: { degree, institution: `${degree} Institute`, period: '2010' },
          })),
        },
      },
    });
    const draft = (await created.json()) as { documentId: string; version: number };
    await request.post(apiUrl(`${API_PATHS.document(PAGE_CV_A_SLUG, draft.documentId)}/publish`), {
      headers: ownerHeaders(),
      data: { expectedVersion: draft.version },
    });
    try {
      await check();
    } finally {
      const removed = await request.delete(
        apiUrl(API_PATHS.document(PAGE_CV_A_SLUG, draft.documentId)),
        { headers: ownerHeaders() },
      );
      expect(removed.status()).toBe(HTTP.NO_CONTENT);
    }
  };

  test('lists every education in order', async ({ page, request }) => {
    const degrees = ['E2E Degree A', 'E2E Degree B', 'E2E Degree C'];
    await withMainCv(request, degrees, async () => {
      await page.goto(cvUrl);
      await expect(page.getByRole('heading', { level: 2, name: EDUCATION_HEADING })).toBeVisible();
      const entries = page.getByRole('heading', { level: 3, name: /^E2E Degree/ });
      await expect(entries).toHaveText(degrees.map((degree) => `${degree} Institute`));
    });
  });

  test('lists a single education', async ({ page, request }) => {
    await withMainCv(request, ['E2E Degree Solo'], async () => {
      await page.goto(cvUrl);
      await expect(
        page.getByRole('heading', { level: 3, name: 'E2E Degree Solo Institute' }),
      ).toBeVisible();
      await expect(page.getByRole('heading', { level: 3, name: /^E2E Degree/ })).toHaveCount(1);
    });
  });

  test('shows no empty Education heading without entries', async ({ page, request }) => {
    await withMainCv(request, [], async () => {
      await page.goto(cvUrl);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E Edu CV');
      await expect(page.getByRole('heading', { level: 2, name: EDUCATION_HEADING })).toHaveCount(0);
    });
  });
});
