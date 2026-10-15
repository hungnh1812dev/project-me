'use client';

import { ImageOffIcon } from 'lucide-react';

import { useMediaSource } from '../../hooks/use-media-source';
import { cn } from '../../lib/cn';
import { defaultImageSrc, type MediaFile } from '../../lib/media';

export interface MediaImageProps {
  file: MediaFile;
  width: number;
  height: number;
  loading?: 'lazy' | 'eager';
  /** How the image fills its box: cropped (`cover`, the picker cards) or whole (`contain`). */
  fit?: 'cover' | 'contain';
  /** Which URL to show: `thumbnailUrl` (falling back to `url`) or the full `url`. */
  source?: 'thumbnail' | 'url';
}

/**
 * An asset's image, filling its container. Only a URL the source's `imageSrc` accepts becomes an
 * `<img src>`, fetched with no referrer; any other gets a placeholder named after the file, with
 * no request.
 */
export const MediaImage: React.FC<MediaImageProps> = ({
  file,
  width,
  height,
  loading,
  fit = 'cover',
  source = 'thumbnail',
}) => {
  const { imageSrc } = useMediaSource();
  const url = source === 'url' ? file.url : (file.thumbnailUrl ?? file.url);
  const src = imageSrc ? imageSrc(url) : defaultImageSrc(url, window.location.origin);
  if (src === null) {
    return (
      <div
        role="img"
        aria-label={file.fileName}
        className="text-muted-foreground flex size-full items-center justify-center"
      >
        <ImageOffIcon aria-hidden="true" className="size-6" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={file.fileName}
      loading={loading}
      width={width}
      height={height}
      referrerPolicy="no-referrer"
      className={cn('size-full', fit === 'contain' ? 'object-contain' : 'object-cover')}
    />
  );
};
MediaImage.displayName = 'MediaImage';
