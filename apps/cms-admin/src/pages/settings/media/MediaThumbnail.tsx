import { ImageOffIcon } from 'lucide-react';

import { cn } from '@repo/ui/lib/cn';

import { API_BASE_URL } from '@/core/config/env';
import { safeImageSrc } from '@/core/security/safeImageSrc';
import type { MediaAsset } from '@/features/settings/types';

export interface MediaThumbnailProps {
  asset: MediaAsset;
  width: number;
  height: number;
  loading?: 'lazy' | 'eager';
  /** How the image fills its box: cropped (`cover`, the grids) or whole (`contain`, the field). */
  fit?: 'cover' | 'contain';
  /** Which URL to show: the small `thumbnailUrl` (the grids) or the full `url` (the field, D10). */
  source?: 'thumbnail' | 'url';
}

/** The image origins `safeImageSrc` accepts besides `https:`: the API's and the admin's own. */
function imageOrigins() {
  const pageOrigin = window.location.origin;
  return { apiOrigin: new URL(API_BASE_URL, pageOrigin).origin, pageOrigin };
}

/**
 * An asset's image, filling its container (P4-SEC-2, AC-18, AC-29). Only an allowlisted URL
 * becomes an `<img src>`, fetched with no referrer; any other URL gets a neutral placeholder with
 * no request, still named after the file.
 */
export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  asset,
  width,
  height,
  loading,
  fit = 'cover',
  source = 'thumbnail',
}) => {
  const src = safeImageSrc(source === 'url' ? asset.url : asset.thumbnailUrl, imageOrigins());
  if (src === null) {
    return (
      <div
        role="img"
        aria-label={asset.fileName}
        className="flex size-full items-center justify-center text-muted-foreground"
      >
        <ImageOffIcon aria-hidden="true" className="size-6" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={asset.fileName}
      loading={loading}
      width={width}
      height={height}
      referrerPolicy="no-referrer"
      className={cn('size-full', fit === 'contain' ? 'object-contain' : 'object-cover')}
    />
  );
};
MediaThumbnail.displayName = 'MediaThumbnail';
