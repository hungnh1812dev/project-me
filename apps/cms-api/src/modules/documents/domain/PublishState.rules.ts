import type { FieldSelection } from '../../access';
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

/** SPEC §16.3: discard overwrites every content field, so the actor must be allowed to write each root field. */
export function writesEveryField(
  writable: FieldSelection,
  rootFieldNames: readonly string[],
): boolean {
  return writable.isUnrestricted || rootFieldNames.every((name) => writable.allows(name));
}
