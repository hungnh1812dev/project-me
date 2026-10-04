import type { Document } from '../src/features/content/types.ts';
import { HOMEPAGE, seedContent, STAMP } from './fixtures/contentFixtures.ts';
import { expect, ROLES, test, type MockApi } from './fixtures/mockApi.ts';

const URL = '/admin/content-types/homepage';
const S = '/api/v1/documents/single-type/homepage';

function signedInAs(mockApi: MockApi, role = ROLES.superAdmin) {
  mockApi.addUser({ email: 'jane@example.com', name: 'Jane Doe', role });
  mockApi.signInAs('jane@example.com');
}

function homepage(overrides: Partial<Document> = {}): Document {
  return {
    documentId: 'homepage-single',
    status: 'draft',
    createdAt: STAMP,
    updatedAt: STAMP,
    updatedBy: { documentId: 'user-1', name: 'Jane Doe' },
    headline: 'Welcome',
    intro: '<p>Hello</p>',
    visitors: 10,
    ...overrides,
  };
}

const calls = (mockApi: MockApi, path: string) =>
  mockApi.requests.filter((r) => r.path.startsWith(path)).map((r) => `${r.method} ${r.status}`);

test('a never-saved single type shows "Not saved yet", then a first save sends only schema fields (AC-17)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  signedInAs(mockApi);

  await page.goto(URL);

  await expect(page.getByRole('heading', { level: 1, name: 'Homepage' })).toBeVisible();
  await expect(page.getByText('Not saved yet')).toBeVisible();
  await expect(page.getByLabel('Headline')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  expect(calls(mockApi, S)).toEqual(['GET 404']);

  await page.getByLabel('Headline').fill('Hello there');
  await page.getByLabel('Visitors').fill('1200');
  await save.click();

  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeAttached();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await expect(page.getByText('Not saved yet')).toHaveCount(0);
  await expect(save).toBeDisabled();
  expect(mockContent.saves).toEqual([
    {
      route: 'S2',
      slug: 'homepage',
      body: { data: { headline: 'Hello there', intro: '', visitors: 1200 } },
    },
  ]);
  expect(mockContent.single('homepage')).toMatchObject({ status: 'draft', visitors: 1200 });
});

test('a saved single type shows its badge and audit line, and the form starts from its values', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.setSingle('homepage', homepage({ status: 'published', updatedBy: null }));
  signedInAs(mockApi);

  await page.goto(URL);

  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Updated .+ by an unknown user$/)).toBeVisible();
  await expect(page.getByLabel('Headline')).toHaveValue('Welcome');
  await expect(page.getByLabel('Visitors')).toHaveValue('10');
});

test('Publish and Unpublish follow the status, send S3 and S4 and update the badge (AC-18)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.setSingle('homepage', homepage());
  signedInAs(mockApi);

  await page.goto(URL);
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Publish', exact: true }).click();

  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Published.' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Unpublish' }).click();

  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Unpublished.' })).toBeAttached();
  expect(calls(mockApi, `${S}/`)).toEqual(['POST 200', 'POST 200']);
  expect(mockContent.single('homepage')?.status).toBe('draft');
});

test('Publish and Unpublish wait for a clean form (AC-18)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.setSingle('homepage', homepage({ status: 'modified' }));
  signedInAs(mockApi);

  await page.goto(URL);
  await page.getByLabel('Headline').fill('Edited');

  const publish = page.getByRole('button', { name: 'Publish', exact: true });
  await expect(publish).toHaveAttribute('aria-disabled', 'true');
  await expect(publish).toHaveAccessibleDescription('Save your changes first.');
  await expect(page.getByRole('button', { name: 'Unpublish' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await publish.click({ force: true });

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(publish).not.toHaveAttribute('aria-disabled');
  expect(calls(mockApi, `${S}/`)).toEqual([]);
});

test('a single type without draft and publish shows no badge and no publish control (Mode B)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.addContentType({
    ...HOMEPAGE,
    documentId: 'ct-footer',
    slug: 'footer',
    name: 'Footer',
    draftToPublish: false,
  });
  mockContent.setSingle('footer', homepage({ status: 'modified' }));
  signedInAs(mockApi);

  await page.goto('/admin/content-types/footer');

  await expect(page.getByLabel('Headline')).toHaveValue('Welcome');
  await expect(page.getByText('Modified', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unpublish' })).toHaveCount(0);
  await expect(page.getByText(/^Updated .+ by Jane Doe$/)).toBeVisible();
});

test('without update the editor is read-only with the reason, and Save sends nothing (AC-14)', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  mockContent.setSingle('homepage', homepage());
  signedInAs(mockApi, ROLES.admin);

  await page.goto(URL);

  await expect(page.getByRole('note')).toContainText('document:update:homepage');
  await expect(page.getByLabel('Headline')).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('Visitors')).toHaveAttribute('readonly', '');
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toHaveAttribute('aria-disabled', 'true');

  await save.click({ force: true });
  expect(calls(mockApi, S)).toEqual(['GET 200']);
  expect(mockContent.saves).toEqual([]);
});

test('a 400 on save shows the messages in a focused alert and keeps the typed values', async ({
  page,
  mockApi,
  mockContent,
}) => {
  seedContent(mockContent);
  // `visitors` starts as a json field, so the client sends a string for it.
  mockContent.addContentType({
    ...HOMEPAGE,
    fields: [
      { name: 'headline', type: 'text', header: true },
      { name: 'visitors', type: 'json' },
    ],
  });
  mockContent.setSingle('homepage', null);
  signedInAs(mockApi);

  await page.goto(URL);
  await page.getByLabel('Headline').fill('Hi');
  await page.getByLabel('Visitors').fill('"x"');
  // Swap the schema behind the client's back so the server answers 400.
  mockContent.addContentType({
    ...HOMEPAGE,
    fields: [
      { name: 'headline', type: 'text', header: true },
      { name: 'visitors', type: 'number' },
    ],
  });
  await page.getByRole('button', { name: 'Save' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('visitors must be a number');
  await expect(alert).toBeFocused();
  await expect(page.getByLabel('Headline')).toHaveValue('Hi');
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});
