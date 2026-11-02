import type { PublishState } from './Documents.constants';

/**
 * SPEC §16.2. The published row's version names the draft version whose
 * content it holds, so equal versions mean equal content.
 */
export function publishStateOf(
  draftVersion: number,
  publishedVersion: number | null,
): PublishState {
  if (publishedVersion === null) return 'draft';
  return draftVersion === publishedVersion ? 'published' : 'modified';
}
