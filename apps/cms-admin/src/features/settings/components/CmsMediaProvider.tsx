import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { MediaProvider } from '@repo/form-commons/components/forms/MediaProvider';
import type { MediaSource } from '@repo/form-commons/hooks/use-media-source';
import type { MediaFile } from '@repo/form-commons/lib/media';

import { API_BASE_URL } from '@/core/config/env';
import { safeImageSrc } from '@/core/security/safeImageSrc';
import { useCan } from '@/features/auth/hooks/useCan';

import { useMediaList, useUploadMedia } from '../hooks/useMedia';
import { UPLOAD_ACCEPT, uploadSummary } from '../media';
import { settingsKeys } from '../queryKeys';
import type { MediaAsset } from '../types';

/** How the media UI shows an M1 asset. */
const describe = (asset: MediaAsset): MediaFile => ({
  id: asset.documentId,
  fileName: asset.fileName,
  url: asset.url,
  thumbnailUrl: asset.thumbnailUrl,
  width: asset.width,
  height: asset.height,
  size: asset.size,
});

/** P4-SEC-2: any `https:` URL, or `http:` on the API's or the admin's own origin. */
const imageSrc = (url: string | undefined) => {
  const pageOrigin = window.location.origin;
  return safeImageSrc(url, { apiOrigin: new URL(API_BASE_URL, pageOrigin).origin, pageOrigin });
};

/**
 * The media library for `MediaInput` (D4, AC-13): the M1 list (gated by `media:read`), M2 uploads
 * (gated by `upload media`) and the image URL allowlist. The first asset a batch adds is the one
 * the refetched list has that it didn't have before.
 */
export const CmsMediaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const media = useMediaList();
  const uploads = useUploadMedia();
  const canUpload = useCan('upload', 'media');
  const queryClient = useQueryClient();
  const { data, error, refetch, decision } = media;

  const source = useMemo<MediaSource<MediaAsset>>(
    () => ({
      items: data,
      error: error && { message: error.message, forbidden: error.status === 403 },
      refetch: () => void refetch(),
      describe,
      canBrowse: decision,
      canUpload,
      upload: async (files) => {
        const before = new Set((data ?? []).map((asset) => asset.documentId));
        const result = await uploads.upload(files);
        if (!result) return null;
        // The upload refetched M1.
        const after = queryClient.getQueryData<MediaAsset[]>(settingsKeys.media()) ?? [];
        return {
          added: after.filter((asset) => !before.has(asset.documentId)),
          summary: uploadSummary(result),
        };
      },
      uploads: uploads.items,
      uploading: uploads.isUploading,
      accept: UPLOAD_ACCEPT,
      uploadHint: 'or drop PNG or JPEG images here',
      imageSrc,
    }),
    [data, error, refetch, decision, canUpload, uploads, queryClient],
  );

  return <MediaProvider value={source}>{children}</MediaProvider>;
};
CmsMediaProvider.displayName = 'CmsMediaProvider';
