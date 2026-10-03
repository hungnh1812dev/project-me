import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { SchemaForm } from '@/components/form/SchemaForm';
import type { ContentType } from '@/features/content/types';
import {
  makeContentType,
  makeDocument,
  makeListedItem,
  makeListResponse,
} from '@/test/contentFixtures';
import { makeMediaAsset, makeMeUser, makeRole } from '@/test/fixtures';
import {
  bulkDeleteDocumentsHandler,
  createDocumentHandler,
  deleteDocumentHandler,
  duplicateDocumentHandler,
  getContentTypeHandler,
  getDocumentHandler,
  getSingleTypeHandler,
  listDocumentsHandler,
  patchListFieldsHandler,
  publishDocumentHandler,
  publishSingleTypeHandler,
  saveSingleTypeHandler,
  unpublishDocumentHandler,
  unpublishSingleTypeHandler,
  updateDocumentHandler,
  type ContentHandler,
} from '@/test/msw/contentHandlers';
import { server } from '@/test/msw/server';
import { listMediaHandler, uploadMediaHandler } from '@/test/msw/settingsHandlers';
import { renderRoutes, renderWithProviders } from '@/test/renderWithProviders';

import CollectionListPage from './CollectionListPage';
import DocumentCreatePage from './DocumentCreatePage';
import DocumentDetailPage from './DocumentDetailPage';
import SingleTypeEditorPage from './SingleTypeEditorPage';

// The permission gating matrix (SPEC "Permission gating matrix", AC-32), row by row: every gated
// control, rendered for a user missing its grant, is aria-disabled with the policy's reason and
// sends no request when activated. Document grants are checked both globally (`document:publish`
// missing) and slug-scoped (`document:publish:article` missing, `document:publish:other` held).

type Action = 'create' | 'update' | 'delete' | 'publish' | 'unpublish';
type Scope = 'global' | 'scoped';

const ACTIONS: Action[] = ['create', 'update', 'delete', 'publish', 'unpublish'];
const BASE = ['content_type:read', 'content_type:manager', 'media:read', 'media:manager'];

const ARTICLE = makeContentType({
  fields: [
    { name: 'title', type: 'text', header: true },
    { name: 'views', type: 'number' },
  ],
  listFields: ['title'],
});
const HOME: ContentType = makeContentType({
  slug: 'home',
  name: 'Home',
  kind: 'single',
  fields: [{ name: 'headline', type: 'text', header: true }],
});

/** Every grant on `slug` except `missing`, held globally or scoped (plus `missing` on another type). */
function permissionsWithout(missing: Action, scope: Scope, slug: string): string[] {
  const kept = ACTIONS.filter((action) => action !== missing);
  if (scope === 'global') {
    return [...BASE, 'document:read', ...kept.map((action) => `document:${action}`)];
  }
  return [
    ...BASE,
    `document:read:${slug}`,
    ...kept.map((action) => `document:${action}:${slug}`),
    `document:${missing}:other`,
  ];
}

const auth = (permissions: string[]) => ({
  status: 'authenticated' as const,
  user: makeMeUser({ role: makeRole({ permissions }) }),
});

/** The collection list with one modified entry, so Publish and Unpublish both apply. */
function renderList(permissions: string[]) {
  server.use(
    listDocumentsHandler(() =>
      HttpResponse.json(
        makeListResponse({
          items: [
            makeListedItem({
              documentId: 'doc-1',
              status: 'modified',
              data: { title: 'Hello world' },
            }),
          ],
          total: 1,
        }),
      ),
    ).handler,
  );
  return renderRoutes(
    [{ path: '/admin/content-types/:slug', element: <CollectionListPage type={ARTICLE} /> }],
    { route: '/admin/content-types/article', auth: auth(permissions) },
  );
}

function renderDetail(permissions: string[]) {
  server.use(
    getContentTypeHandler(() => HttpResponse.json(ARTICLE)).handler,
    getDocumentHandler(() =>
      HttpResponse.json({
        data: makeDocument({ documentId: 'doc-1', status: 'modified', title: 'Hello world' }),
      }),
    ).handler,
  );
  return renderRoutes(
    [
      { path: '/admin/content-types/:slug/:documentId', element: <DocumentDetailPage /> },
      { path: '/admin/content-types/:slug', element: <h1>List</h1> },
    ],
    { route: '/admin/content-types/article/doc-1', auth: auth(permissions) },
  );
}

function renderSingle(permissions: string[]) {
  server.use(
    getSingleTypeHandler(() =>
      HttpResponse.json({ data: makeDocument({ status: 'modified', headline: 'Hi' }) }),
    ).handler,
  );
  return renderRoutes(
    [
      { path: '/admin/content-types/home', element: <SingleTypeEditorPage type={HOME} /> },
      { path: '/admin/content-types', element: <h1>Overview</h1> },
    ],
    { route: '/admin/content-types/home', auth: auth(permissions) },
  );
}

const button = (name: string) => screen.findByRole('button', { name });

async function selectRow(user: UserEvent) {
  await user.click(await screen.findByRole('checkbox', { name: 'Select Hello world' }));
}

async function rowItem(user: UserEvent, name: string) {
  await user.click(await screen.findByRole('button', { name: 'Actions for Hello world' }));
  const menu = await screen.findByRole('menu');
  return within(menu).getByRole('menuitem', { name: new RegExp(`^${name}`) });
}

interface Row {
  control: string;
  action: Action;
  slug: string;
  render: (permissions: string[]) => { user: UserEvent };
  find: (user: UserEvent) => Promise<HTMLElement>;
  recorder: () => ContentHandler;
}

const ROWS: Row[] = [
  // Create entry, Duplicate: access.create
  {
    control: 'Create entry (list)',
    action: 'create',
    slug: 'article',
    render: renderList,
    find: () => button('Create entry'),
    recorder: createDocumentHandler,
  },
  {
    control: 'Duplicate (row)',
    action: 'create',
    slug: 'article',
    render: renderList,
    find: (user) => rowItem(user, 'Duplicate'),
    recorder: duplicateDocumentHandler,
  },
  {
    control: 'Duplicate (detail)',
    action: 'create',
    slug: 'article',
    render: renderDetail,
    find: () => button('Duplicate'),
    recorder: duplicateDocumentHandler,
  },
  // Save: access.update on the detail page and the single type
  {
    control: 'Save (detail)',
    action: 'update',
    slug: 'article',
    render: renderDetail,
    find: () => button('Save'),
    recorder: updateDocumentHandler,
  },
  {
    control: 'Save (single type)',
    action: 'update',
    slug: 'home',
    render: renderSingle,
    find: () => button('Save'),
    recorder: saveSingleTypeHandler,
  },
  // Delete, Delete selected: access.delete / bulkDelete
  {
    control: 'Delete (row)',
    action: 'delete',
    slug: 'article',
    render: renderList,
    find: (user) => rowItem(user, 'Delete'),
    recorder: deleteDocumentHandler,
  },
  {
    control: 'Delete (detail)',
    action: 'delete',
    slug: 'article',
    render: renderDetail,
    find: () => button('Delete'),
    recorder: deleteDocumentHandler,
  },
  {
    control: 'Delete selected',
    action: 'delete',
    slug: 'article',
    render: renderList,
    find: async (user) => {
      await selectRow(user);
      return button('Delete selected');
    },
    recorder: bulkDeleteDocumentsHandler,
  },
  // Publish / Unpublish (+ bulk): access.publish / unpublish
  ...(['publish', 'unpublish'] as const).flatMap((action): Row[] => {
    const name = action === 'publish' ? 'Publish' : 'Unpublish';
    const recorder = action === 'publish' ? publishDocumentHandler : unpublishDocumentHandler;
    return [
      {
        control: `${name} (row)`,
        action,
        slug: 'article',
        render: renderList,
        find: (user) => rowItem(user, name),
        recorder,
      },
      {
        control: `${name} (detail)`,
        action,
        slug: 'article',
        render: renderDetail,
        find: () => button(name),
        recorder,
      },
      {
        control: `${name} (single type)`,
        action,
        slug: 'home',
        render: renderSingle,
        find: () => button(name),
        recorder: action === 'publish' ? publishSingleTypeHandler : unpublishSingleTypeHandler,
      },
      {
        control: `${name} selected`,
        action,
        slug: 'article',
        render: renderList,
        find: async (user) => {
          await selectRow(user);
          return button(`${name} selected`);
        },
        recorder,
      },
    ];
  }),
];

const CASES = ROWS.flatMap((row) =>
  (['global', 'scoped'] as const).map((scope) => ({ ...row, scope })),
);

describe('the gating matrix (AC-32)', () => {
  it.each(CASES)(
    '$control without $action ($scope) is disabled with the reason and sends nothing',
    async ({ action, scope, slug, render, find, recorder }) => {
      const handler = recorder();
      server.use(handler.handler);
      const { user } = render(permissionsWithout(action, scope, slug));

      const control = await find(user);
      expect(control).toHaveAttribute('aria-disabled', 'true');
      expect(control).toHaveAccessibleDescription(
        `Requires the "document:${action}:${slug}" permission.`,
      );
      await user.click(control);

      expect(handler.requests).toHaveLength(0);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    },
  );

  it('Save on the create page: without create, the page redirects to /403 and sends no D2', async () => {
    const d2 = createDocumentHandler();
    server.use(getContentTypeHandler(() => HttpResponse.json(ARTICLE)).handler, d2.handler);

    renderRoutes(
      [
        { path: '/admin/content-types/:slug/new', element: <DocumentCreatePage /> },
        { path: '/403', element: <h1>Forbidden</h1> },
      ],
      {
        route: '/admin/content-types/article/new',
        auth: auth(permissionsWithout('create', 'scoped', 'article')),
      },
    );

    expect(await screen.findByRole('heading', { name: 'Forbidden' })).toBeInTheDocument();
    expect(d2.requests).toHaveLength(0);
  });

  it('Columns without content_type:manager is disabled with the reason and sends nothing', async () => {
    const c3 = patchListFieldsHandler();
    server.use(c3.handler);
    const { user } = renderList(['content_type:read', 'document:read']);

    const columns = await button('Columns');
    expect(columns).toHaveAttribute('aria-disabled', 'true');
    expect(columns).toHaveAccessibleDescription('Requires the "content_type:manager" permission.');
    await user.click(columns);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(c3.requests).toHaveLength(0);
  });
});

describe('the media picker gating (AC-32)', () => {
  const FIELDS = [{ name: 'cover', type: 'media' as const }];
  const renderForm = (permissions: string[]) =>
    renderWithProviders(
      <SchemaForm id="form" fields={FIELDS} document={null} onSubmit={async (data) => data} />,
      { auth: auth(permissions) },
    );

  it('Choose without media:read is disabled with the reason and loads no list', async () => {
    const m1 = listMediaHandler(() => HttpResponse.json([makeMediaAsset()]));
    server.use(m1.handler);
    const { user } = renderForm([]);

    const choose = screen.getByRole('button', { name: 'Choose Cover' });
    expect(choose).toHaveAttribute('aria-disabled', 'true');
    expect(choose).toHaveAccessibleDescription('Requires the "media:read" permission.');
    await user.click(choose);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(m1.requests).toHaveLength(0);
  });

  it('Upload without media:manager is disabled with the reason and uploads nothing', async () => {
    const m2 = uploadMediaHandler();
    server.use(listMediaHandler(() => HttpResponse.json([makeMediaAsset()])).handler, m2.handler);
    const { user } = renderForm(['media:read']);

    await user.click(screen.getByRole('button', { name: 'Choose Cover' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose cover' });
    const upload = within(dialog).getByRole('button', { name: 'Upload' });
    expect(upload).toHaveAttribute('aria-disabled', 'true');
    expect(upload).toHaveAccessibleDescription(/Requires the "media:manager" permission\./);
    await user.click(upload);

    expect(m2.requests).toHaveLength(0);
  });
});
