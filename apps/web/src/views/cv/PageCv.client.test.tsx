import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AxiosResponse } from 'axios';

import { clientApi } from '@/apis/client/Api.client';
import { PAGE_CV_MOCK } from '@/apis/server/graphql/mocks/PageCv.mock';
import { BFF_ENDPOINTS } from '@/configs/Api.endpoints';
import { useWebSession } from '@/features/session';
import type { AuthApi } from '@/features/session/Auth.api';
import { fakeApi, TEST_USER, Wrapper } from '@/features/session/Session.fixture';

import { PageCvClient } from './PageCv.client';
import type { PageCvA, PageCvData } from './PageCv.graphql';

const TEXT = PAGE_CV_MOCK.cvCommonText;

const cvOf = (name: string | null, overrides: Partial<PageCvA> = {}): PageCvA => ({
  documentId: 'c1',
  name,
  position: 'Platform engineer',
  summary: null,
  skills: null,
  experiences: null,
  projects: null,
  educations: null,
  languages: null,
  references: null,
  _maskedFields: [],
  ...overrides,
});

const SERVER_DATA: PageCvData = { pageCvAList: { data: [cvOf('Mai Server')] }, profile: null };
const OWNER_DATA: PageCvData = { pageCvAList: { data: [cvOf('Mai Private')] }, profile: null };

const signedInApi = () =>
  fakeApi({ readSession: vi.fn<AuthApi['readSession']>().mockResolvedValue(TEST_USER) });

function SignOutButton() {
  const { signOut } = useWebSession();
  return <button onClick={() => void signOut()}>sign out</button>;
}

afterEach(() => vi.restoreAllMocks());

describe('PageCvClient', () => {
  it('shows the server data to an anonymous visitor without a request', async () => {
    const get = vi.spyOn(clientApi, 'get');
    render(
      <Wrapper api={fakeApi()}>
        <PageCvClient initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mai Server' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Platform engineer')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('renders no h1 when the CV has no name', async () => {
    render(
      <Wrapper api={fakeApi()}>
        <PageCvClient
          initialData={{ pageCvAList: { data: [cvOf(null)] }, profile: null }}
          text={TEXT}
        />
      </Wrapper>,
    );
    expect(await screen.findByText('Platform engineer')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('renders the sections and the contact card', async () => {
    render(
      <Wrapper api={fakeApi()}>
        <PageCvClient
          initialData={{
            pageCvAList: {
              data: [
                cvOf('Mai Server', {
                  summary: '<p>Hi there</p>',
                  projects: [
                    {
                      name: 'Billing core',
                      teamSize: null,
                      role: null,
                      liveLink: null,
                      repositoryLink: null,
                      techStack: null,
                      responsibilities: null,
                    },
                  ],
                  skills: [{ skill: 'TypeScript', level: 'Proficient' }],
                  languages: [{ language: 'English', level: 'Fluent' }],
                  references: [{ name: 'Mr. Ref', role: 'Lead', phone: '0900' }],
                }),
              ],
            },
            profile: PAGE_CV_MOCK.profile,
          }}
          text={TEXT}
        />
      </Wrapper>,
    );
    expect(
      await screen.findByRole('link', { name: PAGE_CV_MOCK.profile.email }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([TEXT.summary, TEXT.projects, TEXT.skills, TEXT.languages, TEXT.reference]);
    expect(screen.getByText('English')).toBeInTheDocument();
    expect(screen.getByText('0900')).toBeInTheDocument();
  });

  it('renders the CV with no section title when the labels are null', async () => {
    render(
      <Wrapper api={fakeApi()}>
        <PageCvClient
          initialData={{
            pageCvAList: { data: [cvOf('Mai Server', { summary: '<p>Hi there</p>' })] },
            profile: PAGE_CV_MOCK.profile,
          }}
          text={null}
        />
      </Wrapper>,
    );
    expect(await screen.findByText('Hi there')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Mai Server' })).toBeInTheDocument();
  });

  it('shows an empty busy output while a signed-in refetch loads', async () => {
    vi.spyOn(clientApi, 'get').mockReturnValue(new Promise(() => undefined));
    render(
      <Wrapper api={signedInApi()}>
        <PageCvClient initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );
    const output = await screen.findByRole('status');
    expect(output).toHaveAttribute('aria-busy', 'true');
    expect(output).toBeEmptyDOMElement();
  });

  it('refetches through the BFF once signed in', async () => {
    const get = vi
      .spyOn(clientApi, 'get')
      .mockResolvedValue({ status: 200, data: OWNER_DATA } as AxiosResponse);
    render(
      <Wrapper api={signedInApi()}>
        <PageCvClient initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mai Private' }),
    ).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(BFF_ENDPOINTS.CV);
  });

  it('keeps the server CV with no alert text when the refetch fails', async () => {
    const get = vi.spyOn(clientApi, 'get').mockRejectedValue(new Error('401'));
    render(
      <Wrapper api={signedInApi()}>
        <PageCvClient initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );
    await waitFor(() => expect(get).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Mai Server' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the server data after sign-out', async () => {
    vi.spyOn(clientApi, 'get').mockResolvedValue({
      status: 200,
      data: OWNER_DATA,
    } as AxiosResponse);
    render(
      <Wrapper api={signedInApi()}>
        <SignOutButton />
        <PageCvClient initialData={SERVER_DATA} text={TEXT} />
      </Wrapper>,
    );
    await screen.findByRole('heading', { name: 'Mai Private' });

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));

    expect(await screen.findByRole('heading', { name: 'Mai Server' })).toBeInTheDocument();
  });

  it('leaves a masked value out, never raw', async () => {
    const { container } = render(
      <Wrapper api={fakeApi()}>
        <PageCvClient
          initialData={{
            pageCvAList: {
              data: [cvOf('Mai Server', { summary: '***', _maskedFields: ['summary'] })],
            },
            profile: null,
          }}
          text={null}
        />
      </Wrapper>,
    );
    expect(await screen.findByRole('heading', { name: 'Mai Server' })).toBeInTheDocument();
    expect(container).not.toHaveTextContent('***');
  });

  it('renders nothing when the data holds no CV', () => {
    const { container } = render(
      <Wrapper api={fakeApi()}>
        <PageCvClient initialData={{ pageCvAList: { data: [] }, profile: null }} text={TEXT} />
      </Wrapper>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
