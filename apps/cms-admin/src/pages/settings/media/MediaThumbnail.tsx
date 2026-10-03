import { ImageOffIcon } from 'lucide-react';

import { API_BASE_URL } from '@/core/config/env';
import { safeImageSrc } from '@/core/security/safeImageSrc';
import type { MediaAsset } from '@/features/settings/types';

export interface MediaThumbnailProps {
  asset: MediaAsset;
  width: number;
  height: number;
  loading?: 'lazy' | 'eager';
}

/** The image origins `safeImageSrc` accepts besides `https:`: the API's and the admin's own. */
function imageOrigins() {
  const pageOrigin = window.location.origin;
  return { apiOrigin: new URL(API_BASE_URL, pageOrigin).origin, pageOrigin };
}

/**
 * An asset's thumbnail, filling its container (P4-SEC-2, AC-18). Only an allowlisted URL becomes
 * an `<img src>`, fetched with no referrer; any other URL gets a neutral placeholder with no
 * request, still named after the file.
 */
export const MediaThumbnail: React.FC<MediaThumbnailProps> = ({
  asset,
  width,
  height,
  loading,
}) => {
  const src = safeImageSrc(asset.thumbnailUrl, imageOrigins());
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
      className="size-full object-cover"
    />
  );
};
MediaThumbnail.displayName = 'MediaThumbnail';
