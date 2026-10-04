import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeMediaAsset } from '@/test/fixtures';

import { MediaThumbnail } from './MediaThumbnail';

const ASSET = makeMediaAsset({
  fileName: 'cat.png',
  url: 'https://media.example.com/cat.png',
  thumbnailUrl: 'https://media.example.com/thumb/cat.png',
});

describe('MediaThumbnail (AC-29)', () => {
  it('shows the thumbnail with cover by default, fetched with no referrer', () => {
    render(<MediaThumbnail asset={ASSET} width={64} height={64} />);
    const img = screen.getByRole('img', { name: 'cat.png' });

    expect(img).toHaveAttribute('src', ASSET.thumbnailUrl);
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveClass('object-cover');
    expect(img).not.toHaveClass('object-contain');
  });

  it('uses the full url and contain when asked', () => {
    render(<MediaThumbnail asset={ASSET} width={640} height={480} source="url" fit="contain" />);
    const img = screen.getByRole('img', { name: 'cat.png' });

    expect(img).toHaveAttribute('src', ASSET.url);
    expect(img).toHaveClass('object-contain');
    expect(img).not.toHaveClass('object-cover');
  });

  it('shows the neutral placeholder, named after the file, for a url that is not allowlisted', () => {
    const asset = makeMediaAsset({ fileName: 'evil.png', url: 'javascript:alert(1)' });
    const { container } = render(
      <MediaThumbnail asset={asset} width={640} height={480} source="url" />,
    );

    expect(screen.getByRole('img', { name: 'evil.png' }).tagName).toBe('DIV');
    expect(container.querySelector('img')).toBeNull();
  });

  it('checks only the chosen source against the allowlist', () => {
    const asset = makeMediaAsset({ fileName: 'mixed.png', thumbnailUrl: 'data:image/png,x' });
    render(<MediaThumbnail asset={asset} width={640} height={480} source="url" />);

    expect(screen.getByRole('img', { name: 'mixed.png' })).toHaveAttribute('src', asset.url);
  });
});
