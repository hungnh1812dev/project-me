import { expect, test } from '@playwright/test';

import { inviteAccount } from '../src/Accounts.fixture';
import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { CV_PAGE_SLUG, HTTP, RUN_ID } from '../src/E2e.constants';
import { bearer, ownerApiToken, signInAsOwner } from '../src/Session.fixture';

const EDITOR_ROLE = 'Editor';
const EDITOR_EMAIL = `validate-editor-${RUN_ID}@example.test`;
const EDITOR_PASSWORD = `Validate-${RUN_ID}-Pw1!`;
const FREE_SLUG = `e2e-free-${RUN_ID}`;

interface ValidateAnswer {
  valid: boolean;
  errors: { path: (string | number)[]; rule: string; message: string }[];
}

const validDefinition = {
  slug: FREE_SLUG,
  displayName: 'E2E free',
  kind: 'collection',
  draftAndPublish: false,
  fields: [{ name: 'title', type: 'text' }],
};

test.describe('content-types validate route (owner only)', () => {
  test('owner gets valid, invalid with paths and a collision named by slug; editor gets 403', async ({
    browser,
    page,
    request,
  }) => {
    const owner = bearer(await ownerApiToken(request));
    const post = (data: unknown, headers: Record<string, string>) =>
      request.post(apiUrl(API_PATHS.CONTENT_TYPES_VALIDATE), { data, headers });

    const valid = await post({ definition: validDefinition, mode: 'create' }, owner);
    expect(valid.status()).toBe(HTTP.OK);
    expect(await valid.json()).toEqual({ valid: true, errors: [] });

    const invalid = await post(
      {
        definition: { ...validDefinition, fields: [{ name: 'title', type: 'nope' }] },
        mode: 'create',
      },
      owner,
    );
    expect(invalid.status()).toBe(HTTP.OK);
    const invalidBody = (await invalid.json()) as ValidateAnswer;
    expect(invalidBody.valid).toBe(false);
    expect(invalidBody.errors.length).toBeGreaterThan(0);
    for (const error of invalidBody.errors) {
      expect(Array.isArray(error.path)).toBe(true);
      expect(error.rule).toBeTruthy();
    }

    const clash = await post(
      { definition: { ...validDefinition, slug: CV_PAGE_SLUG }, mode: 'create' },
      owner,
    );
    expect(clash.status()).toBe(HTTP.OK);
    const clashBody = (await clash.json()) as ValidateAnswer;
    expect(clashBody.valid).toBe(false);
    expect(clashBody.errors.some((error) => error.rule === 'identifier.collision')).toBe(true);
    expect(clash.headers()['cache-control']).toContain('no-store');

    const unauthenticated = await post({ definition: validDefinition, mode: 'create' }, {});
    expect(unauthenticated.status()).toBe(HTTP.UNAUTHORIZED);

    await signInAsOwner(page);
    await inviteAccount(page, browser, {
      email: EDITOR_EMAIL,
      name: `Validate editor ${RUN_ID}`,
      role: EDITOR_ROLE,
      password: EDITOR_PASSWORD,
    });
    const login = await request.post(apiUrl(API_PATHS.AUTH.LOGIN), {
      data: { email: EDITOR_EMAIL, password: EDITOR_PASSWORD },
    });
    expect(login.status()).toBe(HTTP.OK);
    const editor = bearer(((await login.json()) as { accessToken: string }).accessToken);
    const forbidden = await post({ definition: validDefinition, mode: 'create' }, editor);
    expect(forbidden.status()).toBe(HTTP.FORBIDDEN);
    const forbiddenBadBody = await post({ nonsense: true }, editor);
    expect(forbiddenBadBody.status()).toBe(HTTP.FORBIDDEN);
  });
});
