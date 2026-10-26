import { act, screen } from '@testing-library/react';

import type { FakeHandler } from '../../../test/FakeApi.fixture';
import {
  createTestServices,
  renderApp,
  TEST_USER,
} from '../../../test/RenderApp.fixture';
import { CV_PAGE_TYPE } from '../../../test/CvPage.fixture';
import { API_ENDPOINTS } from '../../config/Api.endpoints';
import { PRESENCE_HEARTBEAT_MS } from './content.constants';
import { contentEditPath } from '../../config/App.routes';

const { REFRESH, ME } = API_ENDPOINTS.AUTH;
const { CONTENT_TYPES, DOCUMENTS, ROLES } = API_ENDPOINTS;
const SLUG = 'cv-page';
const DOC_ID = 'doc_1';
const PRESENCE_KEY = `POST ${DOCUMENTS.PRESENCE(SLUG, DOC_ID)}`;

const entry = (accountId: string, displayName: string) => ({
  accountId,
  displayName,
  state: 'editing',
  lastSeenAt: '2026-10-21T10:00:00.000Z',
});

async function open(presence: FakeHandler) {
  const { api, services } = createTestServices({
    [`POST ${REFRESH}`]: () => ({ status: 200, data: { accessToken: 't1' } }),
    [`GET ${ME}`]: () => ({ status: 200, data: TEST_USER }),
    [`GET ${ROLES.LIST}`]: () => ({ status: 200, data: { data: [] } }),
    [`GET ${CONTENT_TYPES.ONE(SLUG)}`]: () => ({
      status: 200,
      data: CV_PAGE_TYPE,
    }),
    [`GET ${DOCUMENTS.BY_ID(SLUG, DOC_ID)}`]: () => ({
      status: 200,
      data: {
        documentId: DOC_ID,
        version: 1,
        values: {},
        components: {},
        _maskedFields: [],
      },
    }),
    [PRESENCE_KEY]: presence,
  });
  await services.session.restore();
  const view = renderApp(services, contentEditPath(SLUG, DOC_ID));
  return { api, view };
}

describe('PresenceBanner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the other editors and hides the caller', async () => {
    const { api } = await open(() => ({
      status: 200,
      data: [entry(TEST_USER.id, 'Mai Tran'), entry('acc_2', 'Linh Pham')],
    }));
    expect(
      await screen.findByText('Linh Pham is also on this document.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Mai Tran is also/)).not.toBeInTheDocument();
    expect(api.callsTo(PRESENCE_KEY)).toHaveLength(1);
  });

  it('shows nothing when only the caller is present', async () => {
    const { api } = await open(() => ({
      status: 200,
      data: [entry(TEST_USER.id, 'Mai Tran')],
    }));
    await screen.findByRole('button', { name: /save draft/i });
    expect(api.callsTo(PRESENCE_KEY).length).toBeGreaterThan(0);
    expect(screen.queryByText(/also on this document/)).not.toBeInTheDocument();
  });

  it('hides the banner when the heartbeat fails', async () => {
    await open(() => ({ status: 403 }));
    await screen.findByRole('button', { name: /save draft/i });
    expect(screen.queryByText(/also on this document/)).not.toBeInTheDocument();
  });

  it('beats every 20 s and stops after unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api, view } = await open(() => ({ status: 200, data: [] }));
    await screen.findByRole('button', { name: /save draft/i });
    const before = api.callsTo(PRESENCE_KEY).length;
    await act(() => vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_MS));
    expect(api.callsTo(PRESENCE_KEY).length).toBe(before + 1);
    view.unmount();
    const afterUnmount = api.callsTo(PRESENCE_KEY).length;
    await act(() => vi.advanceTimersByTimeAsync(PRESENCE_HEARTBEAT_MS * 3));
    expect(api.callsTo(PRESENCE_KEY).length).toBe(afterUnmount);
  });
});
