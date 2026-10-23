/** What a value is compared as in a permission condition or a list filter. */
export type FieldValueKind =
  'string' | 'integer' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'uuid';

/** Name of the GraphQL output type of a field; the graphql module maps it to the type object. */
export type GraphqlOutputName =
  | 'String'
  | 'Int'
  | 'Decimal'
  | 'Boolean'
  | 'Date'
  | 'DateTime'
  | 'Json'
  | 'Media';

/**
 * Everything the content modules decide per scalar field type. Adding a type
 * means adding one entry to `FIELD_TYPE_SPECS`; every property is required so
 * a missing answer is a compile error, never a silent default.
 */
export interface FieldTypeSpec {
  /** Postgres column type. */
  readonly columnType: string;
  /** Comparison kind in permission conditions; `null` = not usable in a condition. */
  readonly conditionKind: FieldValueKind | null;
  /**
   * May a client filter or sort a list on this field. Separate from
   * `conditionKind` on purpose: `media` compares as an integer in
   * conditions, but its column holds the internal file id, which a client
   * must never be able to probe.
   */
  readonly listQueryable: boolean;
  /** Value an unreadable field takes in a response (SPEC §6 mask). */
  readonly maskedValue: 'sentinel' | 'null';
  /** The column holds a `file_library.id` that must be embedded on read and protected from deletion. */
  readonly referencesMedia: boolean;
  readonly graphqlOutput: GraphqlOutputName;
  /** API value -> column value, for types the driver cannot send as they are. */
  readonly encodeForColumn?: (value: unknown) => unknown;
}
