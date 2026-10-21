import type { MediaKind } from '../../infrastructure/media/media.constants';

const BYTES_PER_MB = 1024 * 1024;

/** SPEC §6 upload limits, per kind. */
export const MEDIA_MAX_BYTES = {
  image: 10 * BYTES_PER_MB,
  pdf: 20 * BYTES_PER_MB,
  video: 100 * BYTES_PER_MB,
} as const satisfies Record<MediaKind, number>;

/** Largest allowed file, and the cap on the whole request (file + multipart framing). */
export const MEDIA_MAX_FILE_BYTES = Math.max(...Object.values(MEDIA_MAX_BYTES));
export const MEDIA_MAX_REQUEST_BYTES = MEDIA_MAX_FILE_BYTES + BYTES_PER_MB;

export interface AllowedMediaType {
  readonly kind: MediaKind;
}

/**
 * D12 allowlist, keyed by the MIME type detected from the magic bytes
 * (`file-type`). SVG and HTML are not here and are never detected as one.
 */
export const ALLOWED_MEDIA_TYPES = {
  'image/jpeg': { kind: 'image' },
  'image/png': { kind: 'image' },
  'image/webp': { kind: 'image' },
  'image/gif': { kind: 'image' },
  'image/avif': { kind: 'image' },
  'application/pdf': { kind: 'pdf' },
  'video/mp4': { kind: 'video' },
} as const satisfies Record<string, AllowedMediaType>;

export type AllowedMime = keyof typeof ALLOWED_MEDIA_TYPES;

export function allowedMediaTypeOf(mime: string): AllowedMediaType | undefined {
  return Object.hasOwn(ALLOWED_MEDIA_TYPES, mime)
    ? ALLOWED_MEDIA_TYPES[mime as AllowedMime]
    : undefined;
}

/** Bytes read before detecting the type (`file-type` needs at most this many). */
export const SNIFF_BYTES = 4_100;

/** Decompression-bomb guard for sharp: most input pixels re-encoded. */
export const MAX_IMAGE_PIXELS = 50_000_000;
export const IMAGE_QUALITY = 90;

/** Multipart form: one `file` part and an optional `alt` text field. */
export const UPLOAD_FIELDS = {
  FILE: 'file',
  ALT: 'alt',
} as const;
export const ALT_MAX_LENGTH = 500;
/** UTF-8 bytes allowed for the alt field (4 per character at most). */
export const ALT_MAX_BYTES = ALT_MAX_LENGTH * 4;
export const FILE_NAME_MAX_LENGTH = 255;
/** Name shown when the client sends none (or only unusable characters). */
export const FALLBACK_FILE_NAME = 'file';
export const UPLOAD_TEMP_PREFIX = 'abyss-upload-';
/** Parts allowed in the form: the file and the alt field. */
export const UPLOAD_MAX_PARTS = 2;

export const MEDIA_ERROR_CODES = {
  INVALID_UPLOAD: 'MEDIA_INVALID_UPLOAD',
  UNSUPPORTED_TYPE: 'MEDIA_UNSUPPORTED_TYPE',
  FILE_TOO_LARGE: 'MEDIA_FILE_TOO_LARGE',
  NOT_FOUND: 'MEDIA_NOT_FOUND',
  /** Delete refused: a draft or published document still uses the file. */
  IN_USE: 'MEDIA_IN_USE',
} as const;

export const MEDIA_ERROR_MESSAGES = {
  NOT_MULTIPART: 'Send the file as multipart/form-data.',
  NO_FILE: 'The request has no file.',
  UNEXPECTED_PART: 'Send one "file" part and an optional "alt" field only.',
  ALT_TOO_LONG: 'The alt text is too long.',
  UNSUPPORTED_TYPE:
    'This file type is not allowed. Allowed: JPEG, PNG, WebP, GIF, AVIF, PDF and MP4.',
  UNREADABLE_IMAGE: 'The image could not be read.',
  FILE_TOO_LARGE: 'The file is larger than the limit for its type.',
  NOT_FOUND: 'File not found.',
  IN_USE: 'The file is used by a document. Remove it from the document first.',
} as const;

/** `GET /media` accepts the shared page query only. */
export const MEDIA_ORDER = { CREATED_AT: 'created_at', ID: 'id' } as const;

export const MEDIA_TABLE = 'public.file_library';
export const DELETED_AT_COLUMN = 'deleted_at';

/** Soft-deleted files are purged from storage once older than this (SPEC §9). */
export const MEDIA_PURGE_GRACE_MS = 24 * 60 * 60 * 1000;
/** The purge job runs this often, in-process (one replica; see README). */
export const MEDIA_PURGE_INTERVAL_MS = 60 * 60 * 1000;
/** Rows read per query during a purge run (a run walks all eligible rows). */
export const MEDIA_PURGE_BATCH_SIZE = 100;
