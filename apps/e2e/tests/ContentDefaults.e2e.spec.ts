import { expect, test } from '@playwright/test';

import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { contentNewPath } from '../src/Apps.contract';
import { HTTP } from '../src/E2e.constants';
import { contentSaveButton, fieldByLabel, listItem } from '../src/Locators.fixture';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const FIXTURE_SLUG = 'qc-default-fixture';
const EDIT_URL = /\/content\/qc-default-fixture\/([0-9a-f-]{36})$/;
const NO_VALUE = 'Choose a value';

// Needs the temporary fixture content type (title, active, mood with defaults; blocks component).
test.describe(
  'owner: a new document starts with the field defaults',
  { tag: ['@cms-admin', '@cms-api', '@content-editing', '@schema-builder'] },
  () => {
    test('defaults on new document and new component entry; cleared and changed before saving; a stored document is not filled', async ({
      page,
      request,
    }) => {
      const probe = await request.get(apiUrl(API_PATHS.documents(FIXTURE_SLUG)), {
        headers: bearer(await ownerApiToken(request)),
      });
      test.skip(probe.status() === HTTP.NOT_FOUND, 'the temporary fixture type is not installed');
      await signInAsOwner(page);
      await page.goto(contentNewPath(FIXTURE_SLUG));
      const title = fieldByLabel(page, 'Title');
      await expect(title).toHaveValue('Default title');
      await expect(page.getByRole('switch', { name: 'Active' })).toBeChecked();
      await expect(fieldByLabel(page, 'Mood')).toHaveValue('busy');
      await expect(fieldByLabel(page, 'Plain')).toHaveValue('');

      await page.getByRole('button', { name: 'Click to add blocks' }).click();
      const block = listItem(page, 'Blocks', 0);
      await expect(fieldByLabel(block, 'Label')).toHaveValue('Block label');
      await expect(block.getByRole('switch', { name: 'Enabled' })).toBeChecked();

      await title.fill('');
      await expect(title).toHaveValue('');
      await fieldByLabel(page, 'Mood').selectOption('calm');
      await expect(fieldByLabel(page, 'Mood')).toHaveValue('calm');
      await fieldByLabel(page, 'Mood').selectOption({ label: NO_VALUE });
      await fieldByLabel(page, 'Plain').fill('stored by qc');

      await Promise.all([page.waitForURL(EDIT_URL), contentSaveButton(page).click()]);
      await page.reload();
      await expect(fieldByLabel(page, 'Plain')).toHaveValue('stored by qc');
      await expect(fieldByLabel(page, 'Title')).toHaveValue('');
      await expect(fieldByLabel(page, 'Mood')).toHaveValue('');
    });
  },
);
