/** DI token of the `ContentTypeRepository` binding. */
export const CONTENT_TYPE_REPOSITORY = Symbol('CONTENT_TYPE_REPOSITORY');

/** What `content:migrate` left in storage: the definitions, or nothing because it never ran. */
export type StoredContentTypes =
  | { status: 'loaded'; definitions: readonly unknown[] }
  | { status: 'not-migrated' };

/**
 * Reads the content type definitions `content:migrate` stored. Definitions
 * are returned unvalidated: the registry validates them, so a hand-edited
 * row cannot inject a SQL name.
 */
export interface ContentTypeRepository {
  loadDefinitions(): Promise<StoredContentTypes>;
}
