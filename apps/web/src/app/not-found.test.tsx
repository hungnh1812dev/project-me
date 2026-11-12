import { render, screen } from '@testing-library/react';

import { SHELL_TEXT, ShellTextProvider } from '../features/session/Session.fixture';
import { LAST_RESORT_TEXT } from '../features/site-shell';
import NotFound from './not-found';

describe('NotFound', () => {
  it('explains that the page does not exist, with the shell text', () => {
    render(
      <ShellTextProvider>
        <NotFound />
      </ShellTextProvider>,
    );
    expect(
      screen.getByRole('heading', { level: 1, name: SHELL_TEXT.siteText.notFoundTitle }),
    ).toBeInTheDocument();
  });

  it('falls back to the last-resort text outside the provider', () => {
    render(<NotFound />);
    expect(
      screen.getByRole('heading', { level: 1, name: LAST_RESORT_TEXT.notFoundTitle }),
    ).toBeInTheDocument();
  });
});
