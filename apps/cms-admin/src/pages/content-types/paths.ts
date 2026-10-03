const BASE = '/admin/content-types';

/** The collection list (or single-type editor) of `slug`. */
export const listPath = (slug: string): string => `${BASE}/${encodeURIComponent(slug)}`;

/** The detail page of one collection entry. */
export const documentPath = (slug: string, documentId: string): string =>
  `${listPath(slug)}/${encodeURIComponent(documentId)}`;

/**
 * Router state for a page that should announce something once it opens, for example "Entry
 * created." after the create page replaced itself with the new entry.
 */
export interface AnnounceState {
  announce: string;
}

/** The message carried in `location.state`, if any. */
export function announcementOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('announce' in state)) return null;
  const { announce } = state;
  return typeof announce === 'string' && announce !== '' ? announce : null;
}
