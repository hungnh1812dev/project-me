import { render, screen } from '@testing-library/react';

import { COPY } from '../config/Copy.constants';
import NotFound from './not-found';

describe('NotFound', () => {
  it('explains that the page does not exist', () => {
    render(<NotFound />);
    expect(
      screen.getByRole('heading', { level: 1, name: COPY.notFound.title }),
    ).toBeInTheDocument();
  });
});
