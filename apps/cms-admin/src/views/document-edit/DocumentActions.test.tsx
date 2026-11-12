import { API_ENDPOINTS } from '@configs/Api.endpoints';
import { contentEditPath } from '@configs/App.routes';
import { EN_TEXT } from '@configs/locales/en';
import { CV_PAGE_TYPE } from '@test/CvPage.fixture';
import { createTestServices, renderApp, TEST_USER } from '@test/RenderApp.fixture';
import { screen } from '@testing-library/react';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const copy = EN_TEXT.content;
const SLUG = 'cv-page';
const DOC_ID = 'doc_1';

async function openModifiedDocument() {
  const { services } = createTestServices({
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
        publishState: 'modified',
      },
    }),
  });
  await services.session.restore();
  renderApp(services, contentEditPath(SLUG, DOC_ID));
  await screen.findByLabelText('Position');
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
