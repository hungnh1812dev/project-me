/** Files per page of the media library (API default 20, max 100). */
export const MEDIA_PAGE_SIZE = 20;

/** Longest alt text the API accepts (characters); mirrors cms-api ALT_MAX_LENGTH. */
export const MEDIA_ALT_MAX_LENGTH = 500;

/** `accept` of the upload picker: the types the API allows (SPEC D12). */
export const MEDIA_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/avif,application/pdf,video/mp4';

/** Permission subject of the library. */
export const MEDIA_SUBJECT = 'media';
