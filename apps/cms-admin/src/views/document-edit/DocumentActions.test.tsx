import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { contentEditPath } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import { CONTENT_QUERY_KEYS } from '@features/content/Content.queries';
import { CV_PAGE_TYPE } from '@test/CvPage.fixture';
import type { FakeHandler } from '@test/FakeApi.fixture';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const copy = EN_TEXT.content;
const SLUG = 'cv-page';
const DOC_ID = 'doc_1';

async function openModifiedDocument(
  state = 'modified',
  lifecycleReply?: Record<string, FakeHandler>,
) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: { ...TEST_USER, role: 'owner' } }),
    [`GET ${ROLES.LIST}`]: () => ({
      status: 200,
      data: { data: [{ id: 'r1', slug: 'owner', name: 'owner', rank: 5, permissions: [] }] },
    }),
    [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: () => ({ status: 200, data: CV_PAGE_TYPE }),
    [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
      status: 200,
      data: {
        documentId: DOC_ID,
        version: 3,
        values: { position: 'Engineer', isMain: false, name: 'Acme', summary: '<p>Hi</p>' },
        components: {},
        _maskedFields: [],
        publishState: state,
      },
    }),
    ...lifecycleReply,
  });
  await services.session.restore();
  renderApp(services, contentEditPath(SLUG, DOC_ID));
  await screen.findByLabelText('Position');
  const invalidate = vi.spyOn(services.queryClient, 'invalidateQueries');
  return { api, invalidate };
}

describe('DocumentActions button order', () => {
  it('puts Discard apart at the left end, then Unpublish, Save and the one primary Publish', async () => {
    await openModifiedDocument();
    const group = screen.getByRole('group', { name: copy.actions.group });
    const labels = Array.from(group.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual([
      copy.actions.discard,
      copy.actions.unpublish,
      copy.save,
      copy.actions.publish,
    ]);
    expect(screen.getByRole('button', { name: copy.actions.discard })).toHaveClass('mr-auto');
  });
});

const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(([filter]) => (filter as { queryKey: unknown[] }).queryKey);

describe('DocumentActions invalidation', () => {
  const ok = { status: 200, data: { documentId: DOC_ID, version: 4 } };
  const reply = (path: string, result: { status: number; data: unknown }) => ({
    [`POST ${path}`]: () => result,
  });
  const confirmDialog = async (label: string) =>
    userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: label }));

  it.each([
    ['publish', 'modified', DOCUMENTS.PUBLISH(SLUG, DOC_ID)],
    ['unpublish', 'published', DOCUMENTS.UNPUBLISH(SLUG, DOC_ID)],
    ['discard', 'modified', DOCUMENTS.DISCARD(SLUG, DOC_ID)],
  ] as const)('invalidates the list and the draft after %s', async (action, state, path) => {
    const { invalidate } = await openModifiedDocument(state, reply(path, ok));
    await userEvent.click(screen.getByRole('button', { name: copy.actions[action] }));
    if (action !== 'publish') await confirmDialog(copy.actions[`${action}Dialog`].confirm);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    const keys = invalidatedKeys(invalidate);
    expect(keys).toContainEqual(CONTENT_QUERY_KEYS.list(SLUG));
    expect(keys).toContainEqual(CONTENT_QUERY_KEYS.draft(SLUG, DOC_ID));
  });

  it('does not refetch on a version conflict until Reload', async () => {
    const conflict = {
      status: 409,
      data: { errorCode: 'DOCUMENT_VERSION_CONFLICT', details: { currentVersion: 5 } },
    };
    const { api, invalidate } = await openModifiedDocument(
      'modified',
      reply(DOCUMENTS.PUBLISH(SLUG, DOC_ID), conflict),
    );
    await userEvent.click(screen.getByRole('button', { name: copy.actions.publish }));
    await screen.findByRole('alert');
    expect(invalidate).not.toHaveBeenCalled();
    expect(api.callsTo(`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`)).toHaveLength(1);
  });
});
