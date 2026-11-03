import { MS_PER_HOUR } from '../../../common/constants/Time.constants';
import type { AllowedMime } from './MediaUpload.rules';

/** Kinds of file the library accepts (SPEC D12); decides storage resource type and size limit. */
export const MEDIA_KINDS = ['image', 'pdf', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const ALT_MAX_LENGTH = 500;
/** UTF-8 bytes allowed for the alt field (4 per character at most). */
export const ALT_MAX_BYTES = ALT_MAX_LENGTH * 4;
export const FILE_NAME_MAX_LENGTH = 255;
/** Leading hex characters of the stored bytes' sha256 that end a stored file name (`<stem>_<hash>.<ext>`). */
export const STORED_NAME_HASH_LENGTH = 8;
/** Name shown when the client sends none (or only unusable characters). */
export const FALLBACK_FILE_NAME = 'file';

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
  UNEXPECTED_REPLACE_PART: 'Send one "file" part only.',
  FAMILY_MISMATCH:
    'The new file must be the same kind as the file it replaces (image, PDF or video).',
  ALT_TOO_LONG: 'The alt text is too long.',
  UNSUPPORTED_TYPE:
    'This file type is not allowed. Allowed: JPEG, PNG, WebP, GIF, AVIF, PDF and MP4.',
  UNREADABLE_IMAGE: 'The image could not be read.',
  FILE_TOO_LARGE: 'The file is larger than the limit for its type.',
  NOT_FOUND: 'File not found.',
  IN_USE: 'The file is used by a document. Remove it from the document first.',
} as const;

/**
 * A document write that points a media field at a file it cannot use. The
 * wire value equals the documents module's invalid-body code, so clients see
 * one shape. Missing, deleted and unreadable files all answer with this code
 * and `mediaRefInvalidMessage`, so the answer never reveals that a file exists.
 */
export const MEDIA_REF_ERROR_CODES = {
  INVALID: 'DOCUMENT_INVALID',
} as const;

export function mediaRefInvalidMessage(inputPath: string): string {
  return `${inputPath} refers to a file that does not exist`;
}

/** `provider` of rows whose bytes ship with the app, not in `MediaStorage`; the purge job never deletes their object. */
export const PRESET_MEDIA_PROVIDER = 'preset';

/** Soft-deleted files are purged from storage once older than this (SPEC §9). */
export const MEDIA_PURGE_GRACE_MS = 24 * MS_PER_HOUR;
/** Rows read per query during a purge run (a run walks all eligible rows). */
export const MEDIA_PURGE_BATCH_SIZE = 100;

/** File extension of each allowlisted MIME type; the local storage names files `<key>.<ext>` and serves the type back from it. */
export const MEDIA_FILE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
} as const satisfies Record<AllowedMime, string>;

/** A stored key is never reused (replace writes a new key), so a public file can be cached for good. */
export const PUBLIC_MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
