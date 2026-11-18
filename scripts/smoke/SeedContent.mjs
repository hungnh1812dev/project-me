// Writes one create body per published content type of the smoke stack into <out dir>/<slug>.json.
// The text comes from the web mocks (the same data as WEB_COPY in apps/e2e), so the staging web
// renders on the stack the text the @web specs look for. Run by scripts/smoke/content.sh.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = path.join(import.meta.dirname, '../..');
const MOCKS_DIR = path.join(ROOT_DIR, 'apps/web/src/apis/server/graphql/mocks');
const SCHEMAS_DIR = path.join(ROOT_DIR, 'apps/cms-api/content/schemas');
const MEDIA_FIELD_TYPE = 'media';
const COMPONENT_FIELD_TYPE = 'component';
/** Mock keys that are not content fields: the API adds them to its answers. */
const ANSWER_ONLY_KEYS = new Set(['documentId', '_maskedFields']);

const { SITE_HEADER_MOCK } = await import(path.join(MOCKS_DIR, 'SiteHeader.mock.ts'));
const { NOT_FOUND_PAGE_MOCK } = await import(path.join(MOCKS_DIR, 'NotFoundPage.mock.ts'));
const { SIGN_IN_MOCK } = await import(path.join(MOCKS_DIR, 'SignIn.mock.ts'));
const { MODULE_STATUS_MOCK } = await import(path.join(MOCKS_DIR, 'ModuleStatus.mock.ts'));
const { PAGE_CV_MOCK } = await import(path.join(MOCKS_DIR, 'PageCv.mock.ts'));

/** One entry per content type: the schema slug, the mock data and the values the mock lacks. */
const SEEDS = [
  { slug: 'header', data: { ...SITE_HEADER_MOCK.header, ...NOT_FOUND_PAGE_MOCK.notFoundText } },
  { slug: 'module-auth', data: SIGN_IN_MOCK.signInText },
  { slug: 'module-status', data: MODULE_STATUS_MOCK.statusText },
  { slug: 'cv-common-text', data: PAGE_CV_MOCK.cvCommonText },
  { slug: 'profile', data: PAGE_CV_MOCK.profile },
  { slug: 'page-cv-a', data: { ...PAGE_CV_MOCK.pageCvAList.data[0], isMain: true } },
];

function toTree(fields, data, where) {
  const known = new Map(fields.map((field) => [field.name, field]));
  for (const key of Object.keys(data)) {
    if (!known.has(key) && !ANSWER_ONLY_KEYS.has(key)) {
      throw new Error(`${where}: mock field "${key}" is not in the content type`);
    }
  }
  const values = {};
  const components = {};
  for (const field of fields) {
    const value = data[field.name];
    if (value === undefined || value === null || field.type === MEDIA_FIELD_TYPE) continue;
    if (field.type === COMPONENT_FIELD_TYPE) {
      const items = Array.isArray(value) ? value : [value];
      components[field.name] = items.map((item) =>
        toTree(field.fields, item, `${where}.${field.name}`),
      );
    } else {
      values[field.name] = value;
    }
  }
  return Object.keys(components).length > 0 ? { values, components } : { values };
}

const outDir = process.argv[2];
if (!outDir) throw new Error('Usage: SeedContent.mjs <out dir>');
mkdirSync(outDir, { recursive: true });
for (const { slug, data } of SEEDS) {
  const schema = JSON.parse(readFileSync(path.join(SCHEMAS_DIR, `${slug}.json`), 'utf8'));
  writeFileSync(
    path.join(outDir, `${slug}.json`),
    JSON.stringify(toTree(schema.fields, data, slug)),
  );
}
