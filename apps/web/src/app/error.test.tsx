import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LAST_RESORT_TEXT } from '@/configs/LastResort.constants';

import ErrorPage from './error';

describe('ErrorPage', () => {
  it('shows the last-resort text, offers a retry and shows no server detail', async () => {
    const retry = vi.fn<() => void>();
    render(<ErrorPage retry={retry} />);

    expect(
      screen.getByRole('heading', { level: 1, name: LAST_RESORT_TEXT.errorTitle }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: LAST_RESORT_TEXT.errorRetry }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
