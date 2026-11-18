import { render, screen } from '@testing-library/react';

import { NOT_FOUND_PAGE_MOCK } from '../../apis/server/graphql/mocks/NotFoundPage.mock';
import { LAST_RESORT_TEXT } from '../../configs/LastResort.constants';
import { loadNotFoundText } from '../../features/not-found/NotFoundPage.server';
import UnknownPathNotFound from './not-found';

vi.mock('../../features/not-found/NotFoundPage.server', () => ({
  loadNotFoundText: vi.fn<typeof loadNotFoundText>(),
}));

describe('UnknownPathNotFound', () => {
  it('explains that the page does not exist, with the text of its own query', async () => {
    vi.mocked(loadNotFoundText).mockResolvedValue(NOT_FOUND_PAGE_MOCK.notFoundText);
    render(await UnknownPathNotFound());
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: NOT_FOUND_PAGE_MOCK.notFoundText.notFoundTitle,
      }),
    ).toBeInTheDocument();
  });

  it('falls back to the last-resort text when the text did not load', async () => {
    vi.mocked(loadNotFoundText).mockResolvedValue(null);
    render(await UnknownPathNotFound());
    expect(
      screen.getByRole('heading', { level: 1, name: LAST_RESORT_TEXT.notFoundTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(LAST_RESORT_TEXT.notFoundDescription)).toBeInTheDocument();
  });
});
