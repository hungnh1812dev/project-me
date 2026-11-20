import { readdirSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { inviteAccount } from '../src/Accounts.fixture';
import { API_PATHS, apiUrl } from '../src/Api.endpoints';
import { HTTP, PAGE_CV_A_SLUG, RUN_ID } from '../src/E2e.constants';
import { bearer, ownerApiToken, signInAsOwner, withHumanCheck } from '../src/Session.fixture';

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

test.describe(
  'content-types validate route (owner only)',
  { tag: ['@cms-api', '@schema-builder'] },
  () => {
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
        { definition: { ...validDefinition, slug: PAGE_CV_A_SLUG }, mode: 'create' },
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
        data: withHumanCheck({ email: EDITOR_EMAIL, password: EDITOR_PASSWORD }),
      });
      expect(login.status()).toBe(HTTP.OK);
      const editor = bearer(((await login.json()) as { accessToken: string }).accessToken);
      const forbidden = await post({ definition: validDefinition, mode: 'create' }, editor);
      expect(forbidden.status()).toBe(HTTP.FORBIDDEN);
      const forbiddenBadBody = await post({ nonsense: true }, editor);
      expect(forbiddenBadBody.status()).toBe(HTTP.FORBIDDEN);
    });
  },
);

const SCHEMA_DIR = new URL('../../cms-api/content/schemas/', import.meta.url);
const COLLISION_RULE = 'identifier.collision';
const MODULE_SLUGS = ['module-auth', 'module-status'];
const RETIRED_SLUGS = ['sign-in-text', 'status-page-text'];

test.describe(
  'content-types validate route against the schema files (owner only)',
  { tag: ['@cms-api', '@schema-builder'] },
  () => {
    test('every schema file is valid in update mode; module slugs collide, retired slugs are free', async ({
      request,
    }) => {
      const owner = bearer(await ownerApiToken(request));
      const post = async (definition: unknown, mode: string) => {
        const answer = await request.post(apiUrl(API_PATHS.CONTENT_TYPES_VALIDATE), {
          data: { definition, mode },
          headers: owner,
        });
        expect(answer.status()).toBe(HTTP.OK);
        return (await answer.json()) as ValidateAnswer;
      };

      const files = readdirSync(SCHEMA_DIR).filter((name) => name.endsWith('.json'));
      expect(files).toEqual(expect.arrayContaining(MODULE_SLUGS.map((slug) => `${slug}.json`)));
      for (const file of files) {
        const definition = JSON.parse(readFileSync(new URL(file, SCHEMA_DIR), 'utf8')) as {
          slug: string;
        };
        expect(await post(definition, 'update'), file).toEqual({ valid: true, errors: [] });
      }

      for (const slug of MODULE_SLUGS) {
        const answer = await post({ ...validDefinition, slug }, 'create');
        expect(answer.valid).toBe(false);
        const collision = answer.errors.find((error) => error.rule === COLLISION_RULE);
        expect(collision?.message).toContain(slug);
        expect(JSON.stringify(answer)).not.toMatch(/table|fields\[/i);
      }
      for (const slug of RETIRED_SLUGS) {
        expect(await post({ ...validDefinition, slug }, 'create')).toEqual({
          valid: true,
          errors: [],
        });
      }
    });
  },
);

const NEW_TYPES = ['biginteger', 'float', 'double', 'time'];
const TOO_MANY_OPTIONS = 51;
const MAX_OPTION_LENGTH = 100;

test.describe(
  'content-types validate route for number, time and enumeration fields (owner only)',
  { tag: ['@cms-api', '@schema-builder'] },
  () => {
    test('new types are accepted and each new key rule is reported on its path', async ({
      request,
    }) => {
      const owner = bearer(await ownerApiToken(request));
      const check = async (fields: unknown[]) => {
        const answer = await request.post(apiUrl(API_PATHS.CONTENT_TYPES_VALIDATE), {
          data: { definition: { ...validDefinition, fields }, mode: 'create' },
          headers: owner,
        });
        expect(answer.status()).toBe(HTTP.OK);
        return (await answer.json()) as ValidateAnswer;
      };
      const pathsOf = (answer: ValidateAnswer) =>
        answer.errors.map((error) => error.path.join('.'));

      const accepted = await check([
        ...NEW_TYPES.map((type) => ({ name: `f${type}`, type })),
        { name: 'level', type: 'enumeration', options: ['low', 'high'] },
        { name: 'count', type: 'integer', unsigned: true },
      ]);
      expect(accepted).toEqual({ valid: true, errors: [] });

      const noOptions = await check([{ name: 'level', type: 'enumeration' }]);
      expect(noOptions.valid).toBe(false);
      expect(pathsOf(noOptions)).toContain('fields.0.options');

      const emptyOptions = await check([{ name: 'level', type: 'enumeration', options: [] }]);
      expect(pathsOf(emptyOptions)).toContain('fields.0.options');

      const duplicated = await check([{ name: 'level', type: 'enumeration', options: ['a', 'a'] }]);
      expect(duplicated.valid).toBe(false);
      expect(pathsOf(duplicated).some((path) => path.startsWith('fields.0.options'))).toBe(true);

      const tooLong = await check([
        { name: 'level', type: 'enumeration', options: ['x'.repeat(MAX_OPTION_LENGTH + 1)] },
      ]);
      expect(pathsOf(tooLong)).toContain('fields.0.options.0');

      const spaced = await check([{ name: 'level', type: 'enumeration', options: [' a'] }]);
      expect(pathsOf(spaced)).toContain('fields.0.options.0');

      const tooMany = await check([
        {
          name: 'level',
          type: 'enumeration',
          options: Array.from({ length: TOO_MANY_OPTIONS }, (_, index) => `o${index}`),
        },
      ]);
      expect(pathsOf(tooMany)).toContain('fields.0.options');

      const unsignedDecimal = await check([{ name: 'price', type: 'decimal', unsigned: true }]);
      expect(unsignedDecimal.valid).toBe(false);
      expect(pathsOf(unsignedDecimal)).toContain('fields.0.unsigned');

      const optionsOnText = await check([{ name: 'title', type: 'text', options: ['a'] }]);
      expect(pathsOf(optionsOnText)).toContain('fields.0.options');
    });

    test('defaults: valid on every allowed type, each wrong default reported on fields.0.default', async ({
      request,
    }) => {
      const owner = bearer(await ownerApiToken(request));
      const check = async (fields: unknown[]) => {
        const answer = await request.post(apiUrl(API_PATHS.CONTENT_TYPES_VALIDATE), {
          data: { definition: { ...validDefinition, fields }, mode: 'create' },
          headers: owner,
        });
        expect(answer.status()).toBe(HTTP.OK);
        return (await answer.json()) as ValidateAnswer;
      };
      const pathsOf = (answer: ValidateAnswer) =>
        answer.errors.map((error) => error.path.join('.'));

      const accepted = await check([
        { name: 'a', type: 'text', default: 'hello' },
        { name: 'b', type: 'string', default: 'long text' },
        { name: 'c', type: 'richtext', default: '<p>hi</p>' },
        { name: 'd', type: 'integer', default: 3 },
        { name: 'e', type: 'biginteger', default: '9007199254740993' },
        { name: 'f', type: 'decimal', default: '1.5' },
        { name: 'g', type: 'float', default: 1.5 },
        { name: 'h', type: 'double', default: 2.5 },
        { name: 'i', type: 'boolean', default: false },
        { name: 'j', type: 'date', default: '2026-01-31' },
        { name: 'k', type: 'datetime', default: '2026-01-31T10:00:00.000Z' },
        { name: 'l', type: 'time', default: '08:30' },
        { name: 'm', type: 'enumeration', options: ['x', 'y'], default: 'x' },
        { name: 'n', type: 'json', default: { a: 1 } },
      ]);
      expect(accepted).toEqual({ valid: true, errors: [] });

      const wrong: unknown[][] = [
        [{ name: 'a', type: 'media', default: 'x' }],
        [{ name: 'a', type: 'text', default: null }],
        [{ name: 'a', type: 'integer', default: 'abc' }],
        [{ name: 'a', type: 'integer', unsigned: true, default: -1 }],
        [{ name: 'a', type: 'enumeration', options: ['x'], default: 'z' }],
        [{ name: 'a', type: 'time', default: '25:99' }],
        [{ name: 'a', type: 'richtext', default: '<img src=x onerror=alert(1)>' }],
        [{ name: 'a', type: 'richtext', default: '<script>alert(1)</script>' }],
      ];
      for (const fields of wrong) {
        const answer = await check(fields);
        expect(answer.valid, JSON.stringify(fields)).toBe(false);
        expect(pathsOf(answer), JSON.stringify(fields)).toContain('fields.0.default');
      }
    });
  },
);
