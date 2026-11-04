import { EN_TEXT } from '@configs/locales/en';
import { render, screen } from '@testing-library/react';

import { ReviewerBanner } from './ReviewerBanner';

describe('ReviewerBanner', () => {
  it('tells the reviewer the session is read-only', async () => {
    render(<ReviewerBanner />);
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(EN_TEXT.reviewer.banner.title);
    expect(banner).toHaveTextContent(EN_TEXT.reviewer.banner.message);
  });
});
