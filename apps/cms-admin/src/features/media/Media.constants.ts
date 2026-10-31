/** Files per page of the media library (API default 20, max 100). */
export const MEDIA_PAGE_SIZE = 20;

/** Longest alt text the API accepts (characters); mirrors cms-api ALT_MAX_LENGTH. */
export const MEDIA_ALT_MAX_LENGTH = 500;

export type MediaKind = 'image' | 'pdf' | 'video';

/** Types the API accepts (SPEC D12); mirrors `mediaUpload.allowedMimeTypes` of the public constants. */
export const MEDIA_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'application/pdf',
  'video/mp4',
];

const BYTES_PER_MEGABYTE = 1024 * 1024;

/** Largest upload per kind (SPEC §6); mirrors `mediaUpload.maxBytesByKind`. */
export const MEDIA_MAX_BYTES_BY_KIND: Readonly<Record<MediaKind, number>> = {
  image: 10 * BYTES_PER_MEGABYTE,
  pdf: 20 * BYTES_PER_MEGABYTE,
  video: 100 * BYTES_PER_MEGABYTE,
};

/** `accept` of the upload picker, derived from the allowlist. */
export const MEDIA_ACCEPT = MEDIA_ALLOWED_MIME_TYPES.join(',');

/** Files sent at the same time by one upload. */
export const MAX_PARALLEL_UPLOADS = 2;

/** Files one upload batch may hold (the API allows 60 uploads per hour per user). */
export const MAX_FILES_PER_BATCH = 20;

/** Permission subject of the library. */
export const MEDIA_SUBJECT = 'media';
