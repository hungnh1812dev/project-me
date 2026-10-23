import { PermissionAction } from '../../generated/prisma/client';
import {
  type ROOT_SYSTEM_COLUMNS,
  SCALAR_FIELD_TYPES,
} from '../content-engine';
import type { ContentDocument } from '../content-engine/content.repository';
import type { ActorKind } from './actor-context';

/** Every permission action (SPEC §6), in enum order. */
export const PERMISSION_ACTIONS = Object.values(PermissionAction);

/** What reviewers and anonymous visitors may ever do (SPEC D2, §1). */
export const READ_ONLY_ACTIONS = [
  PermissionAction.read,
] as const satisfies readonly PermissionAction[];

/** Actions whose payload is checked against `writable_fields`. */
export const FIELD_WRITE_ACTIONS = [
  PermissionAction.create,
  PermissionAction.update,
] as const satisfies readonly PermissionAction[];

export type FieldWriteAction = (typeof FIELD_WRITE_ACTIONS)[number];

/**
 * Subject of a permission row that covers every content type (decision T14).
 * It never covers a system subject. A row for a specific slug overrides it.
 */
export const CONTENT_WILDCARD_SUBJECT = '*';

/** Joins subject and action in a permission string, e.g. `articles:read`. */
export const PERMISSION_STRING_SEPARATOR = ':';

/**
 * Non-content subjects (decision T14) and the actions valid on each.
 * Names use underscores, so they can never equal a content slug
 * (content slugs are kebab-case, see SLUG_PATTERN).
 */
export const SYSTEM_SUBJECT_ACTIONS = {
  accounts: [
    PermissionAction.read,
    PermissionAction.create,
    PermissionAction.update,
    PermissionAction.delete,
  ],
  roles: [
    PermissionAction.read,
    PermissionAction.create,
    PermissionAction.update,
    PermissionAction.delete,
  ],
  api_tokens: [
    PermissionAction.read,
    PermissionAction.create,
    PermissionAction.update,
    PermissionAction.delete,
  ],
  media: [
    PermissionAction.read,
    PermissionAction.create,
    PermissionAction.update,
    PermissionAction.delete,
  ],
  audit_logs: [PermissionAction.read],
  reviewer_settings: [PermissionAction.read, PermissionAction.update],
} as const satisfies Record<string, readonly PermissionAction[]>;

/** The file library subject (T27); read-only actors only see preset rows. */
export const MEDIA_SUBJECT =
  'media' satisfies keyof typeof SYSTEM_SUBJECT_ACTIONS;

export type SystemSubject = keyof typeof SYSTEM_SUBJECT_ACTIONS;

export const SYSTEM_SUBJECTS = Object.keys(
  SYSTEM_SUBJECT_ACTIONS,
) as SystemSubject[];

/** Separator of nested field paths in field lists: `reference.phone`. */
export const FIELD_PATH_SEPARATOR = '.';

/** Conditions DSL (SPEC §8.3). */
export const CONDITION_OPERATORS = ['eq', 'ne', 'in'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

/** The only variables a condition value may name (SPEC §8.3). */
export const CONDITION_VARIABLES = {
  ACTOR_ID: '$actor.id',
  ACTOR_ROLE_RANK: '$actor.roleRank',
} as const;

/** A string starting with this is a variable reference, never a literal. */
export const CONDITION_VARIABLE_PREFIX = '$';

/**
 * Root system columns a condition may use besides the content fields
 * (decision T14): DSL name -> column and the value kind it compares with.
 */
export const CONDITION_SYSTEM_FIELDS = {
  createdBy: { column: 'created_by', kind: 'integer' },
  updatedBy: { column: 'updated_by', kind: 'integer' },
  documentId: { column: 'document_id', kind: 'uuid' },
} as const;

/** Scalar field types a condition may compare (no json: no meaningful equality). */
export const CONDITION_FIELD_TYPES = SCALAR_FIELD_TYPES.filter(
  (type) => type !== 'json',
);

/** Bounds that keep a stored condition (and its SQL) small. */
export const CONDITION_LIMITS = {
  /** Clauses in one `all` list. */
  MAX_CLAUSES: 20,
  /** Values in one `in` list. */
  MAX_IN_VALUES: 50,
  /** Characters of one string literal. */
  MAX_STRING_LENGTH: 255,
} as const;

/** Error codes of permission / token scope validation (T17 and T19 return them). */
export const ACCESS_ERROR_CODES = {
  PERMISSION_INVALID_CONDITION: 'PERMISSION_INVALID_CONDITION',
  PERMISSION_INVALID_SUBJECT: 'PERMISSION_INVALID_SUBJECT',
  PERMISSION_INVALID_ACTION: 'PERMISSION_INVALID_ACTION',
  PERMISSION_INVALID_FIELDS: 'PERMISSION_INVALID_FIELDS',
  TOKEN_SCOPE_INVALID: 'TOKEN_SCOPE_INVALID',
  /** Filter, sort or search on a field the actor cannot read (SPEC D3). */
  FIELD_NOT_READABLE: 'FIELD_NOT_READABLE',
  /** Write payload sets a field the actor cannot write (SPEC D4). */
  FIELD_NOT_WRITABLE: 'FIELD_NOT_WRITABLE',
  /** Query or write payload names a field the content type does not have. */
  FIELD_UNKNOWN: 'FIELD_UNKNOWN',
} as const;

export type AccessErrorCode =
  (typeof ACCESS_ERROR_CODES)[keyof typeof ACCESS_ERROR_CODES];

/** D6 / §12-7: the target's rank is not below the actor's, or it is the actor. */
export const RANK_FORBIDDEN_ERROR = {
  CODE: 'ACCESS_RANK_FORBIDDEN',
  MESSAGE: 'You can only manage accounts and roles ranked below your own role.',
} as const;

/** Metadata key of `@RequirePermission()` (read by the T15 guard). */
export const PERMISSION_METADATA_KEY = 'abyss:access:permission';

/**
 * D9: how long a cached account/role version may be served without a DB
 * read. Writes in this process invalidate at once; the TTL bounds staleness
 * for writes this process cannot see (another replica, a CLI).
 */
export const VERSION_CACHE_TTL_MS = 5_000;

/**
 * Most entries per VersionCache map (accounts, roles). The CMS has a handful
 * of accounts and roles; the cap only bounds memory if something goes wrong.
 * At the cap the oldest entry is dropped (it is re-read on next use).
 */
export const VERSION_CACHE_MAX_ENTRIES = 1_000;

/**
 * SPEC §6 mask: the value an unreadable field takes in every response.
 * Text-like types get the sentinel string, every other type and every
 * component gets `null`.
 */
export const MASK_SENTINEL = '***';
export const MASK_SENTINEL_FIELD_TYPES = [
  'string',
  'text',
  'richtext',
] as const satisfies readonly (typeof SCALAR_FIELD_TYPES)[number][];

/** Key of the masked field paths in a serialized record (SPEC §6). */
export const MASKED_FIELDS_KEY = '_maskedFields';

/**
 * Root system fields of a serialized record (decision T16). They are always
 * readable: field lists cannot name them, and clients need them for
 * identity, OCC and display. They may be filtered and sorted on. The
 * internal row `id` is never sent (`documentId` and `componentUid` are the
 * public keys).
 */
export const RECORD_SYSTEM_FIELDS = [
  'documentId',
  'version',
  'publishedAt',
  'locale',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
] as const satisfies readonly (keyof ContentDocument)[];

export type RecordSystemField = (typeof RECORD_SYSTEM_FIELDS)[number];

/** Root column of each record system field (names from ROOT_SYSTEM_COLUMNS). */
export const RECORD_SYSTEM_COLUMNS = {
  documentId: 'document_id',
  version: 'version',
  publishedAt: 'published_at',
  locale: 'locale',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  createdBy: 'created_by',
  updatedBy: 'updated_by',
} as const satisfies Record<
  RecordSystemField,
  (typeof ROOT_SYSTEM_COLUMNS)[number]
>;

/**
 * System fields that name accounts, and the actor kinds that never see
 * them (user decision T16): they are omitted from responses, not selected,
 * and cannot be filtered, sorted or searched on. Signed-in accounts and API
 * tokens keep them.
 */
export const ACCOUNT_REFERENCE_FIELDS = [
  'createdBy',
  'updatedBy',
] as const satisfies readonly RecordSystemField[];
export const ACCOUNT_REFERENCES_HIDDEN_FROM = [
  'anonymous',
  'reviewer',
] as const satisfies readonly ActorKind[];

/** Keys of the tree part of a write payload and of a component item. */
export const WRITE_TREE_KEYS = {
  VALUES: 'values',
  COMPONENTS: 'components',
  COMPONENT_UID: 'componentUid',
} as const;

/** Messages of the field errors (no raw values, client keys are not echoed). */
export const FIELD_ERROR_MESSAGES = {
  notReadable: (path: string) => `Field "${path}" is not readable.`,
  notWritable: (path: string) => `Field "${path}" is not writable.`,
  unknown: 'The request names a field this content type does not have.',
  invalidPayload: 'The write payload is not a valid document tree.',
} as const;
