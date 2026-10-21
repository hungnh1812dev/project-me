import { PermissionAction } from '../../generated/prisma/client';
import { SCALAR_FIELD_TYPES } from '../content-engine/content-engine.constants';
import type { SystemRoleSlug } from '../identity/identity.constants';

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

/** Formats a date / datetime literal must match before it reaches SQL. */
export const CONDITION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const CONDITION_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Error codes of permission / token scope validation (T17 and T19 return them). */
export const ACCESS_ERROR_CODES = {
  PERMISSION_INVALID_CONDITION: 'PERMISSION_INVALID_CONDITION',
  PERMISSION_INVALID_SUBJECT: 'PERMISSION_INVALID_SUBJECT',
  PERMISSION_INVALID_ACTION: 'PERMISSION_INVALID_ACTION',
  PERMISSION_INVALID_FIELDS: 'PERMISSION_INVALID_FIELDS',
  TOKEN_SCOPE_INVALID: 'TOKEN_SCOPE_INVALID',
} as const;

export type AccessErrorCode =
  (typeof ACCESS_ERROR_CODES)[keyof typeof ACCESS_ERROR_CODES];

/** Metadata key of `@RequirePermission()` (read by the T15 guard). */
export const PERMISSION_METADATA_KEY = 'abyss:access:permission';

/** Key for `pg_advisory_xact_lock`: serialises concurrent permission seeds. */
export const ROLE_PERMISSIONS_SEED_LOCK_KEY = 7_163_201_908n;

export interface DefaultPermission {
  subject: string;
  actions: readonly PermissionAction[];
}

/**
 * Default rows per system role (decision T14), seeded only into a role that
 * has no permission rows yet. `owner` needs none: the evaluator grants it
 * everything on known subjects. `guest` gets nothing until defined.
 * Fields are all (null) and there are no conditions; field profiles for
 * sensitive fields are seeded by T30.
 */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<
  Record<SystemRoleSlug, readonly DefaultPermission[]>
> = {
  owner: [],
  admin: [
    { subject: CONTENT_WILDCARD_SUBJECT, actions: PERMISSION_ACTIONS },
    { subject: 'accounts', actions: SYSTEM_SUBJECT_ACTIONS.accounts },
    { subject: 'roles', actions: SYSTEM_SUBJECT_ACTIONS.roles },
    { subject: 'api_tokens', actions: SYSTEM_SUBJECT_ACTIONS.api_tokens },
    { subject: 'media', actions: SYSTEM_SUBJECT_ACTIONS.media },
  ],
  editor: [
    {
      subject: CONTENT_WILDCARD_SUBJECT,
      actions: [
        PermissionAction.read,
        PermissionAction.create,
        PermissionAction.update,
        PermissionAction.publish,
        PermissionAction.unpublish,
      ],
    },
    {
      subject: 'media',
      actions: [
        PermissionAction.read,
        PermissionAction.create,
        PermissionAction.update,
      ],
    },
  ],
  guest: [],
  reviewer: [
    { subject: CONTENT_WILDCARD_SUBJECT, actions: [PermissionAction.read] },
    { subject: 'media', actions: [PermissionAction.read] },
  ],
  public: [
    { subject: CONTENT_WILDCARD_SUBJECT, actions: [PermissionAction.read] },
  ],
};
