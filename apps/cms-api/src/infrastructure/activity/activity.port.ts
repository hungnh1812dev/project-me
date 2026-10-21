/** What happened to a document (SPEC D15: content edits are tracked through a pluggable adapter). */
export const CONTENT_ACTIVITY_ACTIONS = [
  'publish',
  'unpublish',
  'delete',
] as const;
export type ContentActivityAction = (typeof CONTENT_ACTIVITY_ACTIONS)[number];

/** Ids and names only: never a field value (D15). */
export interface ContentActivityEvent {
  readonly action: ContentActivityAction;
  /** Content type slug. */
  readonly subject: string;
  readonly documentId: string;
  /** The acting account (the creator for an API token); null if unknown. */
  readonly accountId: number | null;
  /** Set when the actor is an API token. */
  readonly tokenId?: number | undefined;
  /** Version of the draft that was published; absent for other actions. */
  readonly version?: number | undefined;
}

/**
 * Port of activity tracking (`none | database`). Called after the change
 * commits. An adapter failure never fails the request.
 */
export interface ActivityRecorder {
  record(event: ContentActivityEvent): Promise<void>;
}

/** Nest injection token of the active `ActivityRecorder`. */
export const ACTIVITY_RECORDER = Symbol('ACTIVITY_RECORDER');
