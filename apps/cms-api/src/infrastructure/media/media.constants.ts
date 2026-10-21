/** Kinds of file the library accepts (SPEC D12); decides storage resource type and size limit. */
export const MEDIA_KINDS = ['image', 'pdf', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Longest side of the generated image thumbnail, in pixels. */
export const THUMBNAIL_MAX_SIZE_PX = 320;

/** Origin of URLs handed out by the in-memory fake storage (never reachable). */
export const FAKE_STORAGE_ORIGIN = 'https://fake-media.invalid';
export const FAKE_THUMBNAIL_PATH = 'thumb';

/** Cloudinary resource types per media kind. */
export const CLOUDINARY_RESOURCE_TYPES = {
  image: 'image',
  pdf: 'raw',
  video: 'video',
} as const satisfies Record<MediaKind, string>;

/** Raw resources keep their extension in the public id. */
export const CLOUDINARY_RAW_EXTENSION = '.pdf';
