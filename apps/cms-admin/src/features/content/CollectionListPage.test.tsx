import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { FakeHandler } from '../../../test/fake-api';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/render-app';
import { COPY } from '../../config/copy.constants';
import { API_ENDPOINTS } from '../../config/endpoints';
import { contentListPath } from '../../config/routes';
import type { ContentType } from '../content-types';
import type { DocumentListItem } from './content.api';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const copy = COPY.content.collection;
const bulk = COPY.content.bulk;
const SLUG = 'post';

function field(path: string, type: string, system = false) {
  return {
    path,
    type,
    system,
    component: false,
    repeatable: false,
    rootScalar: true,
    conditionKind: null,
    sensitive: false,
  };
}

const POST_TYPE: ContentType = {
  slug: SLUG,
  kind: 'collection',
  draftAndPublish: true,
  fields: [
    field('title', 'string'),
    field('views', 'integer'),
    field('featured', 'boolean'),
    field('updatedAt', 'datetime', true),
  ],
};

function row(n: number, overrides: Partial<DocumentListItem> = {}) {
  return {
    documentId: `doc_${n}`,
    version: n,
    updatedAt: '2026-10-01T10:00:00.000Z',
    values: { title: `Post ${n}`, views: n * 100, featured: n % 2 === 0 },
    ...overrides,
  };
}

function page(rows: DocumentListItem[], pageNo = 1, total = rows.length) {
  return { data: rows, meta: { page: pageNo, pageSize: 20, total } };
}

const typeHandler =
  (type: ContentType = POST_TYPE): FakeHandler =>
  () => ({ status: 200, data: type });

async function open(
  handlers: Record<string, FakeHandler> = {},
  options: { role?: string; rolePermissions?: unknown[] } = {},
) {
  const user = { ...TEST_USER, role: options.role ?? 'owner' };
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: user }),
    [`GET ${ROLES.LIST}`]: () => ({
      status: 200,
      data: {
        data:
          options.role === undefined
            ? []
            : [
                {
                  id: 'r1',
                  slug: options.role,
                  name: options.role,
                  isSystem: false,
                  accountCount: 1,
                  manageable: false,
                  permissions: options.rolePermissions ?? [],
                },
              ],
      },
    }),
    [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: typeHandler(),
    ...handlers,
  });
  await services.session.restore();
  renderApp(services, contentListPath(SLUG));
  return { api };
}

function bodyOf(call: { data?: unknown } | undefined): {
  atomic: boolean;
  items: Record<string, unknown>[];
} {
  return JSON.parse(String(call?.data)) as {
    atomic: boolean;
    items: Record<string, unknown>[];
  };
}

const LIST_KEY = `GET ${DOCUMENTS.BY_SLUG(SLUG)}`;
const rows5 = [1, 2, 3, 4, 5].map((n) => row(n));

describe('CollectionListPage: list', () => {
  it('lists drafts with columns, links and paging info', async () => {
    const { api } = await open({
      [LIST_KEY]: () => ({ status: 200, data: page(rows5, 1, 45) }),
    });
    expect(await screen.findByRole('link', { name: 'Post 1' })).toHaveAttribute(
      'href',
      '/content/post/doc_1',
    );
    expect(screen.getAllByText('Yes')).toHaveLength(2);
    expect(screen.getByText('1–5 of 45')).toBeInTheDocument();
    const call = api.callsTo(LIST_KEY)[0];
    expect(call?.params).toMatchObject({
      page: 1,
      sort: '-updatedAt',
      status: 'draft',
    });
  });

  it('sorts by a column and goes back to the first page', async () => {
    const user = userEvent.setup();
    const { api } = await open({
      [LIST_KEY]: () => ({ status: 200, data: page(rows5, 1, 45) }),
    });
    await screen.findByRole('link', { name: 'Post 1' });
    await user.click(screen.getByRole('button', { name: 'title' }));
    await waitFor(() => {
      expect(api.callsTo(LIST_KEY).at(-1)?.params).toMatchObject({
        sort: 'title',
        page: 1,
      });
    });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(api.callsTo(LIST_KEY).at(-1)?.params).toMatchObject({
        sort: 'title',
        page: 2,
      });
    });
  });

  it('shows the empty state with the first action', async () => {
    await open({ [LIST_KEY]: () => ({ status: 200, data: page([]) }) });
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: copy.newDocument }),
    ).toHaveAttribute('href', '/content/post/new');
  });

  it('shows a retry when the list fails', async () => {
    await open({ [LIST_KEY]: () => ({ status: 500 }) });
    expect(await screen.findByText(copy.loadFailed)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: COPY.access.errors.retry }),
    ).toBeInTheDocument();
  });

  it('opens the one document of a single type', async () => {
    const { api } = await open({
      [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: typeHandler({
        ...POST_TYPE,
        kind: 'single',
      }),
      [LIST_KEY]: () => ({ status: 200, data: page([row(1)]) }),
      [`GET ${DOCUMENTS.BY_ID(SLUG, 'doc_1')}`]: () => ({
        status: 200,
        data: { ...row(1), components: {}, _maskedFields: [] },
      }),
    });
    await waitFor(() => {
      expect(api.callsTo(`GET ${DOCUMENTS.BY_ID(SLUG, 'doc_1')}`)).toHaveLength(
        1,
      );
    });
  });

  it('opens the create form of a single type without a document', async () => {
    const { api } = await open({
      [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: typeHandler({
        ...POST_TYPE,
        kind: 'single',
      }),
      [LIST_KEY]: () => ({ status: 200, data: page([]) }),
    });
    expect(
      await screen.findByRole('heading', { name: COPY.content.newTitle(SLUG) }),
    ).toBeInTheDocument();
    expect(
      api.callsTo(`GET ${CONTENT_TYPES.ONE(SLUG)}`).length,
    ).toBeGreaterThan(0);
  });

  it('hides selection and bulk actions from a read-only role', async () => {
    await open(
      { [LIST_KEY]: () => ({ status: 200, data: page(rows5) }) },
      {
        role: 'viewer',
        rolePermissions: [
          {
            subject: SLUG,
            action: 'read',
            readableFields: null,
            writableFields: null,
            conditions: null,
          },
        ],
      },
    );
    await screen.findByRole('link', { name: 'Post 1' });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: bulk.import }),
    ).not.toBeInTheDocument();
  });
});

describe('CollectionListPage: bulk actions', () => {
  async function selectFive() {
    const user = userEvent.setup();
    for (const n of [1, 2, 3, 4, 5]) {
      await user.click(
        screen.getByRole('checkbox', { name: `Select Post ${n}` }),
      );
    }
    return user;
  }

  it('publishes five selected rows with their versions', async () => {
    const { api } = await open({
      [LIST_KEY]: () => ({ status: 200, data: page(rows5) }),
      [`POST ${DOCUMENTS.BULK(SLUG, 'publish')}`]: () => ({
        status: 200,
        data: {
          atomic: false,
          succeeded: 5,
          failed: 0,
          results: rows5.map((r, index) => ({
            index,
            status: 'ok',
            documentId: r.documentId,
          })),
        },
      }),
    });
    await screen.findByRole('link', { name: 'Post 1' });
    const user = await selectFive();
    expect(screen.getByText(bulk.selected(5))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: bulk.publish(5) }));

    expect(
      await screen.findByText(bulk.summary.publish(5, 5)),
    ).toBeInTheDocument();
    const body = bodyOf(
      api.callsTo(`POST ${DOCUMENTS.BULK(SLUG, 'publish')}`)[0],
    );
    expect(body.atomic).toBe(false);
    expect(body.items).toEqual(
      rows5.map((r) => ({
        documentId: r.documentId,
        expectedVersion: r.version,
      })),
    );
    expect(screen.queryByText(bulk.selected(5))).not.toBeInTheDocument();
  });

  it('reports per-item failures and keeps the failed rows selected', async () => {
    await open({
      [LIST_KEY]: () => ({ status: 200, data: page(rows5) }),
      [`POST ${DOCUMENTS.BULK(SLUG, 'publish')}`]: () => ({
        status: 200,
        data: {
          atomic: false,
          succeeded: 1,
          failed: 1,
          results: [
            { index: 0, status: 'ok', documentId: 'doc_1' },
            {
              index: 1,
              status: 'error',
              statusCode: 409,
              errorCode: 'DOCUMENT_VERSION_CONFLICT',
              message: 'conflict',
            },
          ],
        },
      }),
    });
    await screen.findByRole('link', { name: 'Post 1' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Post 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Post 2' }));
    await user.click(screen.getByRole('button', { name: bulk.publish(2) }));

    expect(
      await screen.findByText(bulk.summary.publish(1, 2)),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        bulk.summary.failedItem('Post 2', bulk.itemErrors.conflict),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(bulk.selected(1))).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Select Post 2' }),
    ).toBeChecked();
  });

  it('shows a request-level failure', async () => {
    await open({
      [LIST_KEY]: () => ({ status: 200, data: page(rows5) }),
      [`POST ${DOCUMENTS.BULK(SLUG, 'unpublish')}`]: () => ({
        status: 403,
        data: { errorCode: 'FORBIDDEN' },
      }),
    });
    await screen.findByRole('link', { name: 'Post 1' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Post 1' }));
    await user.click(screen.getByRole('button', { name: bulk.unpublish(1) }));
    expect(await screen.findByText(bulk.errors.forbidden)).toBeInTheDocument();
  });

  it('asks before deleting and names the count on the button', async () => {
    const { api } = await open({
      [LIST_KEY]: () => ({ status: 200, data: page(rows5) }),
      [`POST ${DOCUMENTS.BULK(SLUG, 'delete')}`]: () => ({
        status: 200,
        data: {
          atomic: false,
          succeeded: 2,
          failed: 0,
          results: [
            { index: 0, status: 'ok', documentId: 'doc_1' },
            { index: 1, status: 'ok', documentId: 'doc_2' },
          ],
        },
      }),
    });
    await screen.findByRole('link', { name: 'Post 1' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Post 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Post 2' }));
    await user.click(screen.getByRole('button', { name: bulk.delete(2) }));

    const dialog = await screen.findByRole('dialog');
    expect(api.callsTo(`POST ${DOCUMENTS.BULK(SLUG, 'delete')}`)).toHaveLength(
      0,
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: bulk.deleteDialog.confirm(2),
      }),
    );
    expect(
      await screen.findByText(bulk.summary.delete(2, 2)),
    ).toBeInTheDocument();
    expect(
      bodyOf(api.callsTo(`POST ${DOCUMENTS.BULK(SLUG, 'delete')}`)[0]).items,
    ).toEqual([{ documentId: 'doc_1' }, { documentId: 'doc_2' }]);
  });

  it('returns focus to the Delete button after Escape', async () => {
    await open({ [LIST_KEY]: () => ({ status: 200, data: page(rows5) }) });
    await screen.findByRole('link', { name: 'Post 1' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'Select Post 1' }));
    const button = screen.getByRole('button', { name: bulk.delete(1) });
    await user.click(button);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(button).toHaveFocus());
  });

  it('selects every row of the page from the header checkbox', async () => {
    await open({ [LIST_KEY]: () => ({ status: 200, data: page(rows5) }) });
    await screen.findByRole('link', { name: 'Post 1' });
    await userEvent.click(
      screen.getByRole('checkbox', { name: copy.selectAll }),
    );
    expect(screen.getByText(bulk.selected(5))).toBeInTheDocument();
  });
});

describe('CollectionListPage: import', () => {
  const CREATE = `POST ${DOCUMENTS.BULK(SLUG, 'create')}`;

  async function openImport(handlers: Record<string, FakeHandler> = {}) {
    const result = await open({
      [LIST_KEY]: () => ({ status: 200, data: page(rows5) }),
      ...handlers,
    });
    await screen.findByRole('link', { name: 'Post 1' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: bulk.import }));
    const dialog = await screen.findByRole('dialog');
    return { ...result, user, dialog };
  }

  function paste(
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
    text: string,
  ) {
    const box = within(dialog).getByRole('textbox');
    return user.click(box).then(() => user.paste(text));
  }

  it('returns focus to the Import button after Escape', async () => {
    const { user } = await openImport();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: bulk.import })).toHaveFocus(),
    );
  });

  it('rejects text that is not a JSON array before sending', async () => {
    const { api, user, dialog } = await openImport();
    await paste(user, dialog, '{"values":{}}');
    await user.click(within(dialog).getByRole('button', { name: /^Import/ }));
    expect(
      await within(dialog).findByText(bulk.importDialog.notArray),
    ).toBeInTheDocument();
    expect(api.callsTo(CREATE)).toHaveLength(0);
  });

  it('imports items and closes with a notice', async () => {
    const { api, user, dialog } = await openImport({
      [CREATE]: () => ({
        status: 200,
        data: {
          atomic: false,
          succeeded: 2,
          failed: 0,
          results: [
            { index: 0, status: 'ok', documentId: 'a', version: 1 },
            { index: 1, status: 'ok', documentId: 'b', version: 1 },
          ],
        },
      }),
    });
    await paste(
      user,
      dialog,
      '[{"values":{"title":"A"}},{"values":{"title":"B"}}]',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: bulk.importDialog.submit(2),
      }),
    );
    expect(
      await screen.findByText(bulk.importDialog.created(2)),
    ).toBeInTheDocument();
    expect(bodyOf(api.callsTo(CREATE)[0])).toEqual({
      atomic: false,
      items: [{ values: { title: 'A' } }, { values: { title: 'B' } }],
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lists the failed items and keeps only them in the text', async () => {
    const { user, dialog } = await openImport({
      [CREATE]: () => ({
        status: 200,
        data: {
          atomic: false,
          succeeded: 1,
          failed: 1,
          results: [
            { index: 0, status: 'ok', documentId: 'a', version: 1 },
            {
              index: 1,
              status: 'error',
              statusCode: 400,
              errorCode: 'DOCUMENT_INVALID',
              message: 'title is required',
            },
          ],
        },
      }),
    });
    await paste(user, dialog, '[{"values":{"title":"A"}},{"values":{}}]');
    await user.click(
      within(dialog).getByRole('button', {
        name: bulk.importDialog.submit(2),
      }),
    );
    expect(
      await within(dialog).findByText(
        bulk.importDialog.itemError(2, 'title is required'),
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(bulk.importDialog.partial(1, 1)),
    ).toBeInTheDocument();
    const box = within(dialog).getByRole<HTMLTextAreaElement>('textbox');
    expect(JSON.parse(box.value)).toEqual([{ values: {} }]);
  });

  it('says nothing was created when an atomic import fails', async () => {
    const { api, user, dialog } = await openImport({
      [CREATE]: () => ({
        status: 400,
        data: {
          errorCode: 'DOCUMENT_INVALID',
          message: 'title is required',
          details: { index: 2, details: {} },
        },
      }),
    });
    await paste(
      user,
      dialog,
      '[{"values":{"title":"A"}},{"values":{"title":"B"}},{"values":{}}]',
    );
    await user.click(within(dialog).getByLabelText(bulk.importDialog.atomic));
    await user.click(
      within(dialog).getByRole('button', {
        name: bulk.importDialog.submit(3),
      }),
    );
    expect(
      await within(dialog).findByText(
        bulk.importDialog.atomicFailed(3, 'title is required'),
      ),
    ).toBeInTheDocument();
    expect(bodyOf(api.callsTo(CREATE)[0]).atomic).toBe(true);
  });
});
