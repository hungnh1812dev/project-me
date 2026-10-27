import { render, screen, waitFor } from '@testing-library/react';

import { COPY } from '../../config/Copy.constants';
import { apiClient } from '../../lib/Api.client';
import userEvent from '@testing-library/user-event';

import { useWebSession } from '../session';
import type { AuthApi } from '../session/Auth.api';
import { fakeApi, Wrapper } from '../session/Session.fixture';
import { type CvPageData } from './Cv.graphql';
import { CvView } from './CvView';

const resume = (name: string) => ({
  documentId: 'r1',
  position: 'Platform engineer',
  name,
  summary: null,
  skills: null,
  experiences: null,
  educations: null,
  languages: null,
  referees: null,
  _maskedFields: [],
});

const SERVER_DATA: CvPageData = {
  resumeList: { data: [resume('Mai Server')] },
  cvContact: null,
};
const OWNER_DATA: CvPageData = {
  resumeList: { data: [resume('Mai Private')] },
  cvContact: null,
};

function StartReviewerButton() {
  const { startReviewerSession } = useWebSession();
  return (
    <button onClick={() => void startReviewerSession('rev-tok')}>
      start review
    </button>
  );
}

const MASKED_DATA: CvPageData = {
  resumeList: {
    data: [
      { ...resume('Mai Server'), summary: '***', _maskedFields: ['summary'] },
    ],
  },
  cvContact: null,
};

function SignOutButton() {
  const { signOut } = useWebSession();
  return <button onClick={() => void signOut()}>sign out</button>;
}

afterEach(() => vi.restoreAllMocks());

describe('CvView', () => {
  it('shows the server data to an anonymous visitor without a request', async () => {
    const post = vi.spyOn(apiClient, 'post');
    render(
      <Wrapper api={fakeApi()}>
        <CvView initialData={SERVER_DATA} />
      </Wrapper>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mai Server' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Platform engineer')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the empty state when no main resume exists', () => {
    render(
      <Wrapper api={fakeApi()}>
        <CvView initialData={{ resumeList: { data: [] }, cvContact: null }} />
      </Wrapper>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: COPY.cv.emptyTitle }),
    ).toBeInTheDocument();
  });

  it('refetches with the Bearer token once signed in', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockResolvedValue({ status: 200, data: { data: OWNER_DATA } });
    const api = fakeApi({
      refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('reader-token'),
    });
    render(
      <Wrapper api={api}>
        <CvView initialData={SERVER_DATA} />
      </Wrapper>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mai Private' }),
    ).toBeInTheDocument();
    const [, , config] = post.mock.calls[0] as [
      string,
      unknown,
      { headers: Record<string, string> },
    ];
    expect(config.headers.Authorization).toBe('Bearer reader-token');
    expect(api.me).toHaveBeenCalledWith('reader-token');
  });

  it('shows an error, not the public data, when the refetch fails', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      status: 200,
      data: { errors: [{ extensions: { code: 'FORBIDDEN' } }] },
    });
    render(
      <Wrapper
        api={fakeApi({
          refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('t'),
        })}
      >
        <CvView initialData={SERVER_DATA} />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        COPY.cv.refetchFailed,
      ),
    );
    expect(screen.queryByText('Mai Server')).not.toBeInTheDocument();
  });

  it('falls back to the server data after sign-out', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      status: 200,
      data: { data: OWNER_DATA },
    });
    render(
      <Wrapper
        api={fakeApi({
          refresh: vi.fn<AuthApi['refresh']>().mockResolvedValue('t'),
        })}
      >
        <SignOutButton />
        <CvView initialData={SERVER_DATA} />
      </Wrapper>,
    );
    await screen.findByRole('heading', { name: 'Mai Private' });

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));

    expect(
      await screen.findByRole('heading', { name: 'Mai Server' }),
    ).toBeInTheDocument();
  });

  it('tells an anonymous visitor to sign in for a masked value', () => {
    render(
      <Wrapper api={fakeApi()}>
        <CvView initialData={MASKED_DATA} />
      </Wrapper>,
    );
    expect(screen.getByText(COPY.cv.maskedValue)).toBeInTheDocument();
    expect(
      screen.queryByText(COPY.cv.maskedValueForReviewer),
    ).not.toBeInTheDocument();
  });

  it('says hidden for reviewers once a reviewer session starts', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({
      status: 200,
      data: { data: MASKED_DATA },
    });
    render(
      <Wrapper api={fakeApi()}>
        <StartReviewerButton />
        <CvView initialData={MASKED_DATA} />
      </Wrapper>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'start review' }));

    expect(
      await screen.findByText(COPY.cv.maskedValueForReviewer),
    ).toBeInTheDocument();
    expect(screen.queryByText(COPY.cv.maskedValue)).not.toBeInTheDocument();
  });
});
