import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LAST_RESORT_TEXT } from '../features/site-shell';
import GlobalError from './global-error';

describe('GlobalError', () => {
  it('shows the last-resort text with a retry', async () => {
    const retry = vi.fn<() => void>();
    render(<GlobalError retry={retry} />, { container: document.documentElement });
    expect(screen.getByRole('heading', { name: LAST_RESORT_TEXT.errorTitle })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: LAST_RESORT_TEXT.errorRetry }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
