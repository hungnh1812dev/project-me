import type { MediaAsset } from '@/features/settings/types';

/**
 * Media field values (D4). A save writes the full `MediaAsset` object. A read accepts the object
 * or a `documentId` string, which is resolved through the cached M1 list.
 */

/** A media value in the form: the full asset, a `documentId` still to resolve, or nothing. */
export type MediaFormValue = MediaAsset | string | null;

/** Where a media value stands against the M1 list. */
export type ResolvedMedia =
  { status: 'empty' } | { status: 'found'; asset: MediaAsset } | { status: 'missing'; id: string };

/** Whether `value` is an asset object: it has a non-empty `documentId` and a `fileName`. */
export function isMediaAsset(value: unknown): value is MediaAsset {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { documentId, fileName } = value as Record<string, unknown>;
  return typeof documentId === 'string' && documentId !== '' && typeof fileName === 'string';
}

/**
 * The form value of a stored media value: an asset object as it is, a non-blank string as a
 * trimmed `documentId`, and anything else as `null`.
 */
export function readMediaValue(value: unknown): MediaFormValue {
  if (isMediaAsset(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

/**
 * Resolves a media value: an asset object is found as it is; a `documentId` is looked up in
 * `list` (the cached M1 list), and is missing when the list isn't cached or doesn't have it.
 */
export function resolveMedia(
  value: MediaFormValue,
  list: readonly MediaAsset[] | undefined,
): ResolvedMedia {
  const read = readMediaValue(value);
  if (read === null) return { status: 'empty' };
  if (typeof read !== 'string') return { status: 'found', asset: read };
  const asset = list?.find((candidate) => candidate.documentId === read);
  return asset ? { status: 'found', asset } : { status: 'missing', id: read };
}
