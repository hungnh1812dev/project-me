import { render, screen } from '@testing-library/react';

import { MediaPreview } from './MediaPreview';

const labels = { previewFallback: (name: string) => `Preview of ${name}`, videoBadge: 'Video' };
const base = {
  fileName: 'a',
  mimeType: 'image/png',
  url: 'https://cdn.test/a.png',
  thumbnailUrl: null,
  alt: null,
};

describe('MediaPreview', () => {
  it('shows an image from its url with the fallback alt', () => {
    render(<MediaPreview file={base} height="field" labels={labels} />);
    expect(screen.getByRole('img', { name: 'Preview of a' })).toHaveAttribute('src', base.url);
    expect(screen.queryByText('Video')).toBeNull();
  });

  it('prefers the thumbnail and the file alt', () => {
    render(
      <MediaPreview
        file={{ ...base, thumbnailUrl: 'https://cdn.test/t.png', alt: 'A cat' }}
        height="field"
        labels={labels}
      />,
    );
    expect(screen.getByRole('img', { name: 'A cat' })).toHaveAttribute(
      'src',
      'https://cdn.test/t.png',
    );
  });

  it('shows a video thumbnail with the badge', () => {
    render(
      <MediaPreview
        file={{ ...base, mimeType: 'video/mp4', thumbnailUrl: 'https://cdn.test/v.jpg' }}
        height="card"
        labels={labels}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.test/v.jpg');
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('shows a kind icon for a PDF and for a missing preview', () => {
    const { container, rerender } = render(
      <MediaPreview
        file={{ ...base, mimeType: 'application/pdf' }}
        height="field"
        labels={labels}
      />,
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg.lucide-file-text')).not.toBeNull();
    rerender(
      <MediaPreview file={{ ...base, mimeType: undefined }} height="field" labels={labels} />,
    );
    expect(container.querySelector('svg.lucide-file')).not.toBeNull();
  });

  it('uses the height for each variant', () => {
    const { container, rerender } = render(
      <MediaPreview file={base} height="field" labels={labels} />,
    );
    expect(container.firstElementChild).toHaveClass('h-(--size-media-preview)');
    rerender(<MediaPreview file={base} height="card" labels={labels} />);
    expect(container.firstElementChild).toHaveClass('h-(--size-media-card-preview)');
  });

  it('renders the actions slot', () => {
    render(
      <MediaPreview
        file={base}
        height="field"
        labels={labels}
        actions={<button type="button">Replace file</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Replace file' })).toBeInTheDocument();
  });
});
