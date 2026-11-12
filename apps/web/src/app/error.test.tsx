import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SHELL_TEXT, ShellTextProvider } from '../features/session/Session.fixture';
import { LAST_RESORT_TEXT } from '../features/site-shell';
import ErrorPage from './error';

describe('ErrorPage', () => {
  it('offers a retry and shows no server detail', async () => {
    const retry = vi.fn<() => void>();
    render(
      <ShellTextProvider>
        <ErrorPage retry={retry} />
      </ShellTextProvider>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: SHELL_TEXT.siteText.errorTitle }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: SHELL_TEXT.siteText.errorRetry }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('falls back to the last-resort text outside the provider', () => {
    render(<ErrorPage retry={() => undefined} />);
    expect(
      screen.getByRole('heading', { level: 1, name: LAST_RESORT_TEXT.errorTitle }),
    ).toBeInTheDocument();
  });
});
