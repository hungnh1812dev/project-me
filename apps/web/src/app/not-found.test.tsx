import { render, screen } from '@testing-library/react';

import { LAST_RESORT_TEXT } from '../configs/LastResort.constants';
import { loadNotFoundText } from '../features/not-found/NotFoundPage.server';
import NotFound from './not-found';

vi.mock('../features/not-found/NotFoundPage.server', () => ({
  loadNotFoundText: vi.fn<typeof loadNotFoundText>(),
}));

describe('NotFound', () => {
  it('shows the last-resort text and loads no data', () => {
    render(<NotFound />);
    expect(
      screen.getByRole('heading', { level: 1, name: LAST_RESORT_TEXT.notFoundTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(LAST_RESORT_TEXT.notFoundDescription)).toBeInTheDocument();
    expect(loadNotFoundText).not.toHaveBeenCalled();
  });
});
