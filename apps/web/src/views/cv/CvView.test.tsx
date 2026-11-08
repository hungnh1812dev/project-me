import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AxiosResponse } from 'axios';

import { clientApi } from '@/apis/client/Api.client';
import { CV_PAGE_MOCK } from '@/apis/server/restful/mocks/CvPage.mock';
import { BFF_ENDPOINTS } from '@/configs/Api.endpoints';
import { type CvPageData, type CvPageText } from '@/features/cv/Cv.graphql';
import { useWebSession } from '@/features/session';
import type { AuthApi } from '@/features/session/Auth.api';
import { fakeApi, TEST_USER, Wrapper } from '@/features/session/Session.fixture';

import { CvView } from './CvView';

const TEXT: CvPageText = CV_PAGE_MOCK.cvPageText;

const resume = (name: string) => ({
  documentId: 'r1',
  position: 'Platform engineer',
  name,
  summary: null,
  skills: null,
  experiences: null,
  educations: null,
  languages: null,
  references: null,
  _maskedFields: [],
});

const SERVER_DATA: CvPageData = {
  cvPageList: { data: [resume('Mai Server')] },
  cvContact: null,
};
const OWNER_DATA: CvPageData = {
  cvPageList: { data: [resume('Mai Private')] },
  cvContact: null,
};

const MASKED_DATA: CvPageData = {
  cvPageList: {
    data: [{ ...resume('Mai Server'), summary: '***', _maskedFields: ['summary'] }],
  },
  cvContact: null,
};

const signedInApi = () =>
  fakeApi({ readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER) });

function SignOutButton() {
  const { signOut } = useWebSession();
  return <button onClick={() => void signOut()}>sign out</button>;
}

afterEach(() => vi.restoreAllMocks());

describe('CvView', () => {
  it('shows the server data to an anonymous visitor without a request', async () => {
    const get = vi.spyOn(clientApi, 'get');
    render(
      <Wrapper api={fakeApi()}>
        <CvView initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mai Server' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Platform engineer')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('shows the empty state when no main resume exists', () => {
    render(
      <Wrapper api={fakeApi()}>
        <CvView initialData={{ cvPageList: { data: [] }, cvContact: null }} text={TEXT} />
      </Wrapper>,
    );
    expect(screen.getByRole('heading', { level: 1, name: TEXT.emptyTitle })).toBeInTheDocument();
  });

  it('refetches through the BFF once signed in', async () => {
    const get = vi
      .spyOn(clientApi, 'get')
      .mockResolvedValue({ status: 200, data: OWNER_DATA } as AxiosResponse);
    render(
      <Wrapper api={signedInApi()}>
        <CvView initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mai Private' }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(BFF_ENDPOINTS.CV);
  });

  it('shows an error, not the public data, when the refetch fails', async () => {
    vi.spyOn(clientApi, 'get').mockRejectedValue(new Error('401'));
    render(
      <Wrapper api={signedInApi()}>
        <CvView initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(TEXT.refetchFailed));
    expect(screen.queryByText('Mai Server')).not.toBeInTheDocument();
  });

  it('falls back to the server data after sign-out', async () => {
    vi.spyOn(clientApi, 'get').mockResolvedValue({
      status: 200,
      data: OWNER_DATA,
    } as AxiosResponse);
    render(
      <Wrapper api={signedInApi()}>
        <SignOutButton />
        <CvView initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );
    await screen.findByRole('heading', { name: 'Mai Private' });

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));

    expect(await screen.findByRole('heading', { name: 'Mai Server' })).toBeInTheDocument();
  });

  it('tells an anonymous visitor to sign in for a masked value', () => {
    render(
      <Wrapper api={fakeApi()}>
        <CvView initialData={MASKED_DATA} text={TEXT} />
      </Wrapper>,
    );
    expect(screen.getByText(TEXT.maskedValue)).toBeInTheDocument();
  });
});
