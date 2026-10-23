import { type APIRequestContext, expect, test } from '@playwright/test';

import { e2eEnv } from '../src/env';

const DOCUMENTS_PATH = '/documents/cv-page';
const GRAPHQL_PATH = '/graphql';
const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const INVALID_REQUEST_CODE = 'ACCESS_INVALID_REQUEST';
const SECRET = 'SECRET-LIST-VALUE';
const OVER_MAX_IN_VALUES = 21;
const OVER_MAX_FILTERS = 11;
const OVER_MAX_VALUE_LENGTH = 256;

const url = (path: string) => `${e2eEnv.apiBaseUrl}${path}`;
const repeat = (count: number, build: (index: number) => string) =>
  Array.from({ length: count }, (_, index) => build(index));

async function ownerHeaders(request: APIRequestContext) {
  const res = await request.post(url('/auth/login'), {
    data: { email: e2eEnv.ownerEmail, password: e2eEnv.ownerPassword },
  });
  expect(res.status()).toBe(HTTP_OK);
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { Authorization: `Bearer ${accessToken}` };
}

const REST_CASES: [string, string][] = [
  ['page 0', 'page=0'],
  ['page 10001', 'page=10001'],
  ['pageSize 0', 'pageSize=0'],
  ['pageSize over the maximum', 'pageSize=101'],
  ['four sort keys', 'sort=position,summary,isMain,createdAt'],
  ['a repeated sort key', 'sort=position,position'],
  [
    'eleven filters',
    repeat(OVER_MAX_FILTERS, (i) => `filter[position][$ne${i}]=x`).join('&'),
  ],
  [
    'too many in values',
    `filter[position][in]=${repeat(OVER_MAX_IN_VALUES, () => 'x').join('&filter[position][in]=')}`,
  ],
  [
    'a 256 character value',
    `filter[position]=${'x'.repeat(OVER_MAX_VALUE_LENGTH)}`,
  ],
  ['a malformed sort key', `sort=${SECRET}!`],
  ['a malformed filter path', `filter[${SECRET}!]=x`],
];

test.describe('API: list query limits (R2-06)', () => {
  let headers: Record<string, string>;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    headers = await ownerHeaders(request);
    await request.dispose();
  });

  for (const [name, query] of REST_CASES) {
    test(`REST: ${name} is a 400 that echoes no submitted value`, async ({
      request,
    }) => {
      const res = await request.get(url(`${DOCUMENTS_PATH}?${query}`), {
        headers,
      });
      expect(res.status()).toBe(HTTP_BAD_REQUEST);
      const text = await res.text();
      expect(text).toContain(INVALID_REQUEST_CODE);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('x'.repeat(OVER_MAX_VALUE_LENGTH));
    });
  }

  test('REST: a valid list with the default sort is unchanged', async ({
    request,
  }) => {
    const res = await request.get(url(`${DOCUMENTS_PATH}?status=draft`), {
      headers,
    });
    expect(res.status()).toBe(HTTP_OK);
    const body = (await res.json()) as { meta: { page: number } };
    expect(body.meta.page).toBe(1);
  });

  test('REST: a field the role cannot read is still rejected by the guard', async ({
    request,
  }) => {
    const res = await request.get(
      url(`${DOCUMENTS_PATH}?sort=noSuchField${SECRET.length}`),
      { headers },
    );
    expect(res.status()).toBe(HTTP_BAD_REQUEST);
    expect(await res.text()).not.toContain(`noSuchField${SECRET.length}`);
  });

  const GRAPHQL_LIST = `query List($page: Int, $pageSize: Int, $sort: [CvPageSort!], $filter: CvPageFilter) {
    cvPageList(page: $page, pageSize: $pageSize, sort: $sort, filter: $filter, status: DRAFT) {
      meta { page pageSize total } } }`;

  const GRAPHQL_CASES: [string, Record<string, unknown>][] = [
    ['page 0', { page: 0 }],
    ['page 10001', { page: 10_001 }],
    ['pageSize 0', { pageSize: 0 }],
    ['pageSize over the maximum', { pageSize: 101 }],
    [
      'four sort keys',
      {
        sort: ['position', 'summary', 'isMain', 'createdAt'].map((field) => ({
          field,
        })),
      },
    ],
    [
      'a repeated sort key',
      { sort: [{ field: 'position' }, { field: 'position' }] },
    ],
    [
      'too many in values',
      {
        filter: {
          position: { in: repeat(OVER_MAX_IN_VALUES, () => 'x') },
        },
      },
    ],
    [
      'a 256 character value',
      { filter: { position: { eq: 'x'.repeat(OVER_MAX_VALUE_LENGTH) } } },
    ],
  ];

  for (const [name, variables] of GRAPHQL_CASES) {
    test(`GraphQL: ${name} is an invalid-request error`, async ({
      request,
    }) => {
      const res = await request.post(url(GRAPHQL_PATH), {
        headers,
        data: { query: GRAPHQL_LIST, variables },
      });
      const body = (await res.json()) as {
        errors?: { extensions?: { code?: string } }[];
      };
      expect(body.errors?.[0]?.extensions?.code).toBe(INVALID_REQUEST_CODE);
      expect(JSON.stringify(body)).not.toContain('x'.repeat(5 + 1));
    });
  }

  test('GraphQL: a valid list works', async ({ request }) => {
    const res = await request.post(url(GRAPHQL_PATH), {
      headers,
      data: { query: GRAPHQL_LIST, variables: { page: 1, pageSize: 5 } },
    });
    const body = (await res.json()) as { errors?: unknown[] };
    expect(body.errors).toBeUndefined();
  });
});
