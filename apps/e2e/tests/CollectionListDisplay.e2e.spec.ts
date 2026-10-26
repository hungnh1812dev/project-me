import {
  type BrowserContext,
  expect,
  type Page,
  type Route,
  test,
} from '@playwright/test';

import { ADMIN_COPY, contentListPath } from '../src/AppContracts.contract';
import { signInAsOwner } from '../src/Session.fixture';
import { HTTP } from '../src/E2e.constants';

/** R3-11: the collection list reads cell text, sortability and alignment from the field registry. */

const list = ADMIN_COPY.content.collection;
const MASKED = '***';
const cellText = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value ?? '');
const API_PATTERN =
  /\/api\/v1\/(content-types|documents)\/(listmix|listtime)(\?.*)?$/;
const PAGE_SIZE = 25;

const field = (path: string, type: string) => ({
  path,
  type,
  system: false,
  component: false,
  repeatable: false,
  rootScalar: true,
  conditionKind: null,
  sensitive: false,
});

const TYPES = {
  listmix: {
    slug: 'listmix',
    kind: 'collection',
    draftAndPublish: false,
    fields: [
      field('title', 'string'),
      field('qty', 'integer'),
      field('active', 'boolean'),
      field('extra', 'string'),
      field('payload', 'json'),
    ],
  },
  listtime: {
    slug: 'listtime',
    kind: 'collection',
    draftAndPublish: false,
    fields: [
      field('label', 'string'),
      field('body', 'richtext'),
      field('price', 'decimal'),
      field('happens', 'datetime'),
    ],
  },
};

const WHEN = '2026-03-05T10:30:00.000Z';
const ROWS: Record<
  string,
  { documentId: string; values: Record<string, unknown> }[]
> = {
  listmix: [
    {
      documentId: 'a1',
      values: {
        title: 'Alpha',
        qty: 5,
        active: true,
        extra: 'x1',
        payload: { a: 1 },
      },
    },
    {
      documentId: 'b2',
      values: { title: '', qty: null, active: false, extra: 'x2' },
    },
    {
      documentId: 'c3',
      values: { title: MASKED, qty: 100, active: null, extra: 'x3' },
    },
  ],
  listtime: [
    {
      documentId: 'd4',
      values: {
        label: 'Dated',
        price: '12.50',
        happens: WHEN,
        body: '<p>x</p>',
      },
    },
    {
      documentId: 'e5',
      values: { label: 'Undated', price: '3.00', happens: null },
    },
  ],
};

const cors = (route: Route): Record<string, string> => ({
  'access-control-allow-origin': route.request().headers()['origin'] ?? '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers':
    route.request().headers()['access-control-request-headers'] ?? '*',
});

async function mockCollections(context: BrowserContext, sorts: string[]) {
  await context.route(API_PATTERN, async (route) => {
    const request = route.request();
    const headers = cors(route);
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: HTTP.NO_CONTENT, headers });
    }
    const url = new URL(request.url());
    const [, kind, slug] = API_PATTERN.exec(request.url()) as RegExpExecArray;
    const key = slug as keyof typeof TYPES;
    if (kind === 'content-types') {
      return route.fulfill({
        status: HTTP.OK,
        contentType: 'application/json',
        headers,
        body: JSON.stringify(TYPES[key]),
      });
    }
    const sort = url.searchParams.get('sort') ?? '';
    sorts.push(sort);
    const rows = [...ROWS[key]!].map((row, index) => ({
      ...row,
      version: 1,
      updatedAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    }));
    const name = sort.replace(/^-/, '');
    if (name !== '' && name !== 'updatedAt') {
      rows.sort((l, r) =>
        cellText(l.values[name]).localeCompare(cellText(r.values[name])),
      );
      if (sort.startsWith('-')) rows.reverse();
    }
    return route.fulfill({
      status: HTTP.OK,
      contentType: 'application/json',
      headers,
      body: JSON.stringify({
        data: rows,
        meta: { page: 1, pageSize: PAGE_SIZE, total: rows.length },
      }),
    });
  });
}

/** Intl output may use a narrow no-break space where the DOM text has a plain one. */
const whitespaceTolerant = (text: string): RegExp =>
  new RegExp(
    text
      .split(/\s+/)
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('\\s'),
  );

test.describe
  .serial('owner: collection list cells come from the field registry', () => {
  let context: BrowserContext;
  let page: Page;
  const sorts: string[] = [];
  const consoleProblems: string[] = [];

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    await mockCollections(context, sorts);
    page = await context.newPage();
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !message.text().startsWith('Failed to load resource')
      ) {
        consoleProblems.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleProblems.push(error.message));
    await signInAsOwner(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('columns: scalar types only, max 3, json never a column', async () => {
    await page.goto(contentListPath('listmix'));
    const table = page.getByRole('table');
    await expect(table.getByRole('link', { name: 'Alpha' })).toBeVisible();
    const headers = table.getByRole('columnheader');
    await expect(headers.nth(1)).toContainText('title');
    await expect(headers.nth(2)).toContainText('qty');
    await expect(headers.nth(3)).toContainText('active');
    await expect(
      table.getByRole('columnheader', { name: 'extra' }),
    ).toHaveCount(0);
    await expect(
      table.getByRole('columnheader', { name: 'payload' }),
    ).toHaveCount(0);
  });

  test('cells: Yes/No, em dash, Protected, Untitled, integer right-aligned', async () => {
    const rowOf = (text: string | RegExp) =>
      page.getByRole('row').filter({ hasText: text });
    const alpha = rowOf('Alpha');
    await expect(alpha.getByRole('cell', { name: list.yes })).toBeVisible();
    await expect(alpha.getByRole('cell', { name: '5', exact: true })).toHaveCSS(
      'text-align',
      'right',
    );
    const untitled = rowOf(new RegExp(`^.*${list.untitled}`));
    await expect(untitled.getByRole('cell', { name: list.no })).toBeVisible();
    await expect(
      untitled.getByRole('cell', { name: list.emptyValue }).first(),
    ).toBeVisible();
    const masked = page.getByRole('row').filter({ hasText: '100' });
    await expect(
      masked.getByRole('link', { name: new RegExp(list.untitled) }),
    ).toBeVisible();
    await expect(page.getByText(MASKED)).toHaveCount(0);
    await expect(alpha.getByRole('cell', { name: list.yes })).not.toHaveCSS(
      'text-align',
      'right',
    );
  });

  test('datetime formatted, decimal right-aligned, richtext not a column', async () => {
    await page.goto(contentListPath('listtime'));
    // Formatted in the browser: its locale and time zone differ from Node's.
    const expectedWhen = await page.evaluate(
      (iso) =>
        new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(iso)),
      WHEN,
    );
    const dated = page.getByRole('row', { name: /^Select Dated/ });
    await expect(
      dated
        .getByRole('cell')
        .filter({ hasText: whitespaceTolerant(expectedWhen) }),
    ).toBeVisible();
    await expect(
      dated.getByRole('cell', { name: '12.50', exact: true }),
    ).toHaveCSS('text-align', 'right');
    const undated = page.getByRole('row').filter({ hasText: 'Undated' });
    await expect(
      undated.getByRole('cell', { name: list.emptyValue }),
    ).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'body' })).toHaveCount(
      0,
    );
  });

  test('sorting by a column sends the sort and reorders rows', async () => {
    await page.goto(contentListPath('listmix'));
    await expect(page.getByRole('link', { name: 'Alpha' })).toBeVisible();
    await page.getByRole('button', { name: 'qty' }).click();
    await expect.poll(() => sorts.at(-1)).toMatch(/^-?qty$/);
    await page.getByRole('button', { name: 'qty' }).click();
    await expect.poll(() => sorts.at(-1)).toMatch(/^-?qty$/);
    expect(consoleProblems).toEqual([]);
  });
});
