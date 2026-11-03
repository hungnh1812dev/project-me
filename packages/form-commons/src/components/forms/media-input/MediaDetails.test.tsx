import { render, screen } from '@testing-library/react';

import { MediaDetails } from './MediaDetails';

const file = {
  fileName: 'portrait.jpg',
  mimeType: 'image/jpeg',
  size: 1536,
  provider: 'cloudinary',
  createdAt: '2026-10-01T10:00:00.000Z',
  sha256: 'abcdef0123456789',
  updatedAt: '2026-10-05T10:00:00.000Z',
  width: 800,
  height: 600,
};

describe('MediaDetails', () => {
  it('shows the stored name without a hash addition, size and provider', () => {
    render(<MediaDetails file={{ ...file, fileName: 'portrait_abcdef01.jpg' }} />);
    expect(screen.getByText('portrait_abcdef01.jpg')).toBeInTheDocument();
    expect(screen.queryByText(/ · /)).toBeNull();
    expect(screen.getByText('1.5 KB')).toBeInTheDocument();
    expect(screen.getByText('cloudinary')).toBeInTheDocument();
  });

  it('still accepts a missing sha256', () => {
    render(<MediaDetails file={{ ...file, sha256: undefined }} />);
    expect(screen.getByText('portrait.jpg')).toBeInTheDocument();
  });

  it('uses updatedAt, falling back to createdAt', () => {
    const { container, rerender } = render(<MediaDetails file={file} />);
    expect(container.querySelector('time')).toHaveAttribute('datetime', file.updatedAt);
    rerender(<MediaDetails file={{ ...file, updatedAt: undefined }} />);
    expect(container.querySelector('time')).toHaveAttribute('datetime', file.createdAt);
  });

  it('shows dimensions for image and video with both known only', () => {
    const { rerender } = render(<MediaDetails file={file} />);
    expect(screen.getByText('800 × 600')).toBeInTheDocument();
    rerender(<MediaDetails file={{ ...file, mimeType: 'video/mp4' }} />);
    expect(screen.getByText('800 × 600')).toBeInTheDocument();
    rerender(<MediaDetails file={{ ...file, mimeType: 'application/pdf' }} />);
    expect(screen.queryByText('800 × 600')).toBeNull();
    rerender(<MediaDetails file={{ ...file, height: null }} />);
    expect(screen.queryByText(/×/)).toBeNull();
  });
});
