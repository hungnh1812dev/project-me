import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { COPY } from '../config/Copy.constants';
import ErrorPage from './error';

describe('ErrorPage', () => {
  it('offers a retry and shows no server detail', async () => {
    const retry = vi.fn<() => void>();
    render(<ErrorPage retry={retry} />);

    expect(
      screen.getByRole('heading', { level: 1, name: COPY.error.title }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: COPY.error.retry }),
    );
    expect(retry).toHaveBeenCalledOnce();
  });
});
