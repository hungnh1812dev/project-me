import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { contentListPath } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import type { ContentType } from '@features/content-types';
import { CONTENT_QUERY_KEYS } from '@features/content/Content.queries';
import { deferred, type FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp, renderInApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation, useNavigate } from 'react-router';

import { SingleTypeRedirect } from './SingleTypeRedirect';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const copy = EN_TEXT.content;
const SLUG = 'header';
const LIST_KEY = `GET ${DOCUMENTS.BY_SLUG(SLUG)}`;
const DOC_KEY = `GET ${DOCUMENTS.BY_ID(SLUG, 'doc_1')}`;
const LIST_QUERY_KEY = [
  ...CONTENT_QUERY_KEYS.list(SLUG),
  { page: 1, sort: undefined, draft: true },
];

const SINGLE_TYPE: ContentType = {
  slug: SLUG,
  displayName: 'Header',
  kind: 'single',
  draftAndPublish: true,
  fields: [
    {
      path: 'title',
      type: 'string',
      system: false,
      component: false,
      repeatable: false,
      rootScalar: true,
      conditionKind: null,
      sensitive: false,
    },
  ],
};

const ONLY_DOCUMENT = {
  documentId: 'doc_1',
  version: 1,
  updatedAt: '2026-10-01T10:00:00.000Z',
  values: { title: 'Saved' },
};

const listOf = (rows: unknown[]) => ({
  status: 200,
  data: { data: rows, meta: { page: 1, pageSize: 20, total: rows.length } },
});

async function open(handlers: Record<string, FakeHandler>, seededRows?: unknown[]) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    [`GET ${ROLES.LIST}`]: () => ({ status: 200, data: { data: [] } }),
    [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: () => ({ status: 200, data: SINGLE_TYPE }),
    [DOC_KEY]: () => ({
      status: 200,
      data: { ...ONLY_DOCUMENT, components: {}, _maskedFields: [] },
    }),
    ...handlers,
  });
  if (seededRows !== undefined) {
    services.queryClient.setQueryData(LIST_QUERY_KEY, listOf(seededRows).data);
  }
  await services.session.restore();
  renderApp(services, contentListPath(SLUG));
  return { api, services };
}

const createHeading = () => screen.queryByRole('heading', { name: copy.newTitle('Header') });
const editHeading = () => screen.findByRole('heading', { name: copy.editTitle('Header') });

describe('SingleTypeRedirect', () => {
  it('opens the document of a fresh answer over a cached empty list, never the create form', async () => {
    const fresh = deferred<ReturnType<typeof listOf>>();
    await open({ [LIST_KEY]: () => fresh.promise }, []);
    await screen.findByText(copy.collection.loading);
    expect(createHeading()).toBeNull();
    fresh.resolve(listOf([ONLY_DOCUMENT]));
    expect(await editHeading()).toBeInTheDocument();
    expect(createHeading()).toBeNull();
  });

  it('shows the skeleton while a refetch runs over a cached list', async () => {
    const fresh = deferred<ReturnType<typeof listOf>>();
    const { api } = await open({ [LIST_KEY]: () => fresh.promise }, [ONLY_DOCUMENT]);
    await waitFor(() => expect(api.callsTo(LIST_KEY)).toHaveLength(1));
    expect(screen.getByText(copy.collection.loading)).toBeInTheDocument();
    expect(api.callsTo(DOC_KEY)).toHaveLength(0);
    fresh.resolve(listOf([ONLY_DOCUMENT]));
    expect(await editHeading()).toBeInTheDocument();
  });

  it('shows the skeleton, then the create form, with no cache and an empty answer', async () => {
    await open({ [LIST_KEY]: () => listOf([]) });
    expect(
      await screen.findByRole('heading', { name: copy.newTitle('Header') }),
    ).toBeInTheDocument();
  });

  it('opens the document with no cache', async () => {
    await open({ [LIST_KEY]: () => listOf([ONLY_DOCUMENT]) });
    expect(await editHeading()).toBeInTheDocument();
  });

  it('shows the error with a retry when the refetch fails after a cached success', async () => {
    await open({ [LIST_KEY]: () => ({ status: 500 }) }, [ONLY_DOCUMENT]);
    expect(await screen.findByText(copy.collection.loadFailed)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: EN_TEXT.access.errors.retry })).toBeInTheDocument();
    expect(createHeading()).toBeNull();
  });

  it('shows the forbidden notice', async () => {
    await open({ [LIST_KEY]: () => ({ status: 403 }) });
    expect(await screen.findByText(copy.collection.forbidden)).toBeInTheDocument();
  });

  it('replaces the list entry, so Back skips it', async () => {
    const { services } = createTestServices({
      [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
      [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
      [LIST_KEY]: () => listOf([ONLY_DOCUMENT]),
    });
    await services.session.restore();
    function Landing() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => void navigate(-1)}>
          back
        </button>
      );
    }
    function Where() {
      return <output aria-label="where">{useLocation().pathname}</output>;
    }
    renderInApp(
      services,
      <>
        <Where />
        <Routes>
          <Route
            path={contentListPath(SLUG)}
            element={<SingleTypeRedirect slug={SLUG} displayName="Header" draftAndPublish />}
          />
          <Route path="*" element={<Landing />} />
        </Routes>
      </>,
      { entries: ['/previous', contentListPath(SLUG)], index: 1 },
    );
    await userEvent.click(await screen.findByRole('button', { name: 'back' }));
    expect(screen.getByLabelText('where')).toHaveTextContent('/previous');
  });
});
