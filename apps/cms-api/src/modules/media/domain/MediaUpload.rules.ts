import { createHash } from 'node:crypto';

import {
  ALT_MAX_LENGTH,
  FALLBACK_FILE_NAME,
  FILE_NAME_MAX_LENGTH,
  type MediaKind,
} from './Media.constants';

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

/** The allowlisted MIME types of kind `image`; each needs a re-encoder. */
export type ImageMime = {
  [M in AllowedMime]: (typeof ALLOWED_MEDIA_TYPES)[M]['kind'] extends 'image' ? M : never;
}[AllowedMime];

/** `?mimeType=` also accepts these family wildcards. */
export const MEDIA_MIME_FAMILY_FILTERS = ['image/*', 'video/*'] as const;

export const MEDIA_MIME_FILTERS = [
  ...(Object.keys(ALLOWED_MEDIA_TYPES) as AllowedMime[]),
  ...MEDIA_MIME_FAMILY_FILTERS,
] as const;

export type MediaMimeFilter = (typeof MEDIA_MIME_FILTERS)[number];

/** The allowlisted MIME types a `?mimeType=` filter matches: one type, or every type of a family. */
export function mimeTypesOfFilter(filter: MediaMimeFilter): readonly AllowedMime[] {
  const allowed = Object.keys(ALLOWED_MEDIA_TYPES) as AllowedMime[];
  if (!filter.endsWith('/*')) return allowed.filter((mime) => mime === filter);
  const familyPrefix = filter.slice(0, -1);
  return allowed.filter((mime) => mime.startsWith(familyPrefix));
}

/** Escapes `\`, `%` and `_` so a search term is matched literally by `ilike`. */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function allowedMediaTypeOf(mime: string): AllowedMediaType | undefined {
  return Object.hasOwn(ALLOWED_MEDIA_TYPES, mime)
    ? ALLOWED_MEDIA_TYPES[mime as AllowedMime]
    : undefined;
}

/** True when both types are allowlisted and of the same kind (image, pdf or video). */
export function isSameMediaFamily(currentMime: string, replacementMime: string): boolean {
  const current = allowedMediaTypeOf(currentMime);
  const replacement = allowedMediaTypeOf(replacementMime);
  return current !== undefined && replacement !== undefined && current.kind === replacement.kind;
}

/**
 * Client file name reduced to a safe display name: no path, no control
 * characters, bounded length. It is never used as a storage key.
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const bounded = Array.from(cleaned).slice(0, FILE_NAME_MAX_LENGTH).join('');
  return bounded === '' || bounded === '.' || bounded === '..' ? FALLBACK_FILE_NAME : bounded;
}

export function isAltWithinLimit(text: string): boolean {
  return Array.from(text).length <= ALT_MAX_LENGTH;
}

/** Alt text as stored: trimmed, and a blank text clears it. */
export function normalizeAlt(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}
