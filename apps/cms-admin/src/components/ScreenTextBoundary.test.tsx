import type { ReactElement } from 'react';
import { COMMON_TEXT, loadScreenText } from '@configs/locales';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenTextBoundary } from './ScreenTextBoundary';

vi.mock('@configs/locales', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@configs/locales')>()),
  loadScreenText: vi.fn<typeof loadScreenText>(),
}));

const loadMock = vi.mocked(loadScreenText);

const runInAct = (action: () => void) =>
  act(() => {
    action();
    return Promise.resolve();
  });

const renderInAct = (ui: ReactElement) => runInAct(() => render(ui));

const deferred = () => {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('ScreenTextBoundary', () => {
  beforeEach(() => {
    loadMock.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows the loading label, then the content', async () => {
    const login = deferred();
    loadMock.mockReturnValue(login.promise as never);
    await renderInAct(
      <ScreenTextBoundary screens={['login']}>
        <p>page body</p>
      </ScreenTextBoundary>,
    );
    expect(screen.getByText(COMMON_TEXT.common.loadingPage)).toBeInTheDocument();
    expect(screen.queryByText('page body')).not.toBeInTheDocument();
    await runInAct(() => login.resolve({}));
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('shows one fallback while two screens load', async () => {
    const first = deferred();
    const second = deferred();
    loadMock.mockImplementation(((name: string) =>
      name === 'login' ? first.promise : second.promise) as never);
    await renderInAct(
      <ScreenTextBoundary screens={['login', 'security']}>
        <p>page body</p>
      </ScreenTextBoundary>,
    );
    expect(screen.getAllByText(COMMON_TEXT.common.loadingPage)).toHaveLength(1);
    await runInAct(() => {
      first.resolve({});
      second.resolve({});
    });
    expect(screen.getByText('page body')).toBeInTheDocument();
    expect(loadMock).toHaveBeenCalledWith('login');
    expect(loadMock).toHaveBeenCalledWith('security');
  });

  it('shows a retry after a failed load and recovers on retry', async () => {
    const failing = Promise.reject(new Error('chunk failed'));
    failing.catch(() => {});
    let isRetried = false;
    loadMock.mockImplementation((() => (isRetried ? Promise.resolve({}) : failing)) as never);
    await renderInAct(
      <ScreenTextBoundary screens={['login']}>
        <p>page body</p>
      </ScreenTextBoundary>,
    );
    await runInAct(() => {});
    expect(screen.getByText(COMMON_TEXT.common.textLoadFailed)).toBeInTheDocument();
    isRetried = true;
    await act(async () => {
      await userEvent.click(screen.getByRole('button', { name: COMMON_TEXT.common.retry }));
    });
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('shows the given fallback instead of the loading label', async () => {
    const login = deferred();
    loadMock.mockReturnValue(login.promise as never);
    await renderInAct(
      <ScreenTextBoundary screens={['login']} fallback={null}>
        <p>page body</p>
      </ScreenTextBoundary>,
    );
    expect(screen.queryByText(COMMON_TEXT.common.loadingPage)).not.toBeInTheDocument();
    expect(screen.queryByText('page body')).not.toBeInTheDocument();
    await runInAct(() => login.resolve({}));
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('renders at once when no screens are listed', () => {
    render(
      <ScreenTextBoundary>
        <p>page body</p>
      </ScreenTextBoundary>,
    );
    expect(screen.getByText('page body')).toBeInTheDocument();
    expect(loadMock).not.toHaveBeenCalled();
  });

  it('renders at once when the load is already fulfilled', () => {
    const settled = Object.assign(Promise.resolve({}), { status: 'fulfilled', value: {} });
    loadMock.mockReturnValue(settled as never);
    render(
      <ScreenTextBoundary screens={['login']}>
        <p>page body</p>
      </ScreenTextBoundary>,
    );
    expect(screen.getByText('page body')).toBeInTheDocument();
    expect(screen.queryByText(COMMON_TEXT.common.loadingPage)).not.toBeInTheDocument();
  });
});
