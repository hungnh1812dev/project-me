/**
 * Pure helpers for `MediaInput` and its picker. The app's asset type stays its own: a media source
 * `describe`s each asset as a `MediaFile` for display, and the input's value is the asset itself.
 */

/** What the media UI shows of an asset. */
export interface MediaFile {
  /** Unique within the library; a value given as a string is looked up by it. */
  id: string;
  fileName: string;
  /** The full image, shown in the input's preview. */
  url: string;
  /** A small image for the picker's cards; `url` when left out. */
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  /** Bytes. */
  size?: number;
}

/** A media input's value: the asset, the id of one still to resolve, or nothing. */
export type MediaValue<T> = T | string | null;

/** Where a media value stands against the library. */
export type ResolvedMedia<T> =
  { status: 'empty' } | { status: 'found'; asset: T } | { status: 'missing'; id: string };

/**
 * Resolves `value`: an asset is found as it is; a non-blank string is a trimmed id looked up in
 * `items`, and is missing when `items` isn't loaded or doesn't have it; anything else is empty.
 */
export function resolveMedia<T>(
  value: MediaValue<T> | undefined,
  items: readonly T[] | undefined,
  describe: (asset: T) => MediaFile,
): ResolvedMedia<T> {
  if (value === null || value === undefined) return { status: 'empty' };
  if (typeof value !== 'string') return { status: 'found', asset: value };
  const id = value.trim();
  if (id === '') return { status: 'empty' };
  const asset = items?.find((item) => describe(item).id === id);
  return asset ? { status: 'found', asset } : { status: 'missing', id };
}

/** The assets whose file name contains `query`, ignoring case and surrounding spaces. */
export function filterMedia<T>(
  items: readonly T[],
  query: string,
  describe: (asset: T) => MediaFile,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...items];
  return items.filter((item) => describe(item).fileName.toLowerCase().includes(needle));
}

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** A byte count in binary units with at most one decimal, for example "1.2 MB". */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

/**
 * The default image URL check: an absolute `https:` URL, or one on the page's own origin.
 * Anything else (`javascript:`, `data:`, other `http:` hosts, unparsable) gives `null`, and the
 * UI shows a placeholder instead of fetching it. Sources with other trusted hosts pass `imageSrc`.
 */
export function defaultImageSrc(url: string | undefined, pageOrigin: string): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === 'https:') return url;
  return parsed.protocol === 'http:' && parsed.origin === pageOrigin ? url : null;
}
