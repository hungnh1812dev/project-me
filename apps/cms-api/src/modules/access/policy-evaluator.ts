import { type Expression, sql, type SqlBool } from 'kysely';

import { PermissionAction } from '../../generated/prisma/client';
import {
  CONTENT_WILDCARD_SUBJECT,
  type FieldWriteAction,
  MEDIA_SUBJECT,
  PERMISSION_STRING_SEPARATOR,
  SYSTEM_SUBJECT_ACTIONS,
} from './access.constants';
import { type ActorContext, type PermissionGrant } from './actor-context';
import { type EffectivePolicy, effectivePolicy } from './effective-policy';
import {
  compileConditions,
  type ConditionActor,
  InvalidConditionError,
} from './conditions.compiler';
import {
  type FieldList,
  fieldListAllows,
  fieldListReaches,
  unionFieldLists,
} from './field-paths';
import type { SubjectCatalog } from './subject-catalog';

/** Fields of one subject an actor may read and write (SPEC D3/D4). */
export class FieldSelection {
  static readonly NONE = new FieldSelection([]);
  static readonly ALL = new FieldSelection(null);

  /** `paths` = null: every field. */
  private constructor(readonly paths: FieldList) {}

  static of(list: FieldList): FieldSelection {
    return list === null ? FieldSelection.ALL : new FieldSelection(list);
  }

  get isUnrestricted(): boolean {
    return this.paths === null;
  }

  /** True when the field path (or a component containing it) is allowed. */
  allows(path: string): boolean {
    return fieldListAllows(this.paths, path);
  }

  /** True when the path or any field inside it is allowed (see `fieldListReaches`). */
  reaches(path: string): boolean {
    return fieldListReaches(this.paths, path);
  }
}

export interface FieldAccess {
  readable: FieldSelection;
  writable: FieldSelection;
}

/**
 * The SQL condition of a row filter. Other modules pass it to their
 * repository without reading it.
 */
export type RowCondition = Expression<SqlBool>;

/**
 * Row filter for an action on a subject. `where: null` = every row.
 * `allowed: false` = no permission (403 before any SQL runs).
 */
export type RowFilter =
  { allowed: false } | { allowed: true; where: RowCondition | null };

const NO_ACCESS: FieldAccess = {
  readable: FieldSelection.NONE,
  writable: FieldSelection.NONE,
};

/**
 * The one place that decides what an actor may do with a subject.
 *
 * Rules:
 * - An unknown subject (not a registered content type, not a system
 *   subject) is always denied, owner included. `*` is never a request
 *   subject.
 * - The Owner role may do every action valid on a known subject.
 * - For a content type, rows naming its slug override the `*` rows for the
 *   same action; rows at the same level add up (fields union, conditions OR).
 * - `can()` ignores conditions (they narrow rows, see `rowFilter()`).
 * - Reviewers and anonymous visitors only ever read published content.
 * - API tokens reach content subjects only, through scope ∩ creator (D5).
 */
export class PolicyEvaluator {
  constructor(private readonly subjects: SubjectCatalog) {}

  can(actor: ActorContext, action: PermissionAction, subject: string): boolean {
    if (!this.isActionValid(action, subject)) return false;
    const policy = this.policyOf(actor);
    if (!this.reachable(policy, action, subject)) return false;
    return policy.full || this.grantsFor(policy, action, subject).length > 0;
  }

  /**
   * Every `subject:action` string the actor may use on a known subject,
   * sorted. Conditions are ignored, as in `can()`. Never contains
   * the `*` wildcard: it lists concrete content types and system subjects.
   */
  effectivePermissions(actor: ActorContext): string[] {
    const subjects = [
      ...this.subjects.contentTypeSlugs(),
      ...Object.keys(SYSTEM_SUBJECT_ACTIONS),
    ];
    const permissionStrings: string[] = [];
    for (const subject of subjects) {
      for (const action of this.subjects.actionsFor(subject)) {
        if (this.can(actor, action, subject)) {
          permissionStrings.push(
            `${subject}${PERMISSION_STRING_SEPARATOR}${action}`,
          );
        }
      }
    }
    return permissionStrings.sort();
  }

  /** Drafts need `read` + `update`; never for read-only actors. */
  canReadDrafts(actor: ActorContext, subject: string): boolean {
    if (!this.subjects.isContentType(subject)) return false;
    return (
      this.can(actor, PermissionAction.read, subject) &&
      this.can(actor, PermissionAction.update, subject)
    );
  }

  /**
   * Readable fields come from `read` rows, writable ones from the rows of
   * `writeAction` (`update` by default; pass `create` for a create payload).
   */
  fieldsFor(
    actor: ActorContext,
    subject: string,
    writeAction: FieldWriteAction = PermissionAction.update,
  ): FieldAccess {
    const policy = this.policyOf(actor);
    const read = this.fieldListFor(
      policy,
      PermissionAction.read,
      subject,
      (grant) => grant.readableFields,
    );
    const write = this.fieldListFor(
      policy,
      writeAction,
      subject,
      (grant) => grant.writableFields,
    );
    if (read === undefined && write === undefined) return NO_ACCESS;
    return {
      readable:
        read === undefined ? FieldSelection.NONE : FieldSelection.of(read),
      writable:
        write === undefined ? FieldSelection.NONE : FieldSelection.of(write),
    };
  }

  /**
   * Row-level conditions of an action on a content type as a parameterized
   * SQL expression (SPEC §8.3). A stored condition that no longer validates
   * (e.g. its field was removed) grants nothing: it fails closed.
   */
  rowFilter(
    actor: ActorContext,
    action: PermissionAction,
    subject: string,
    table?: string,
  ): RowFilter {
    const filter = this.conditionRowFilter(actor, action, subject, table);
    if (!filter.allowed) return filter;
    const policy = this.policyOf(actor);
    if (subject !== MEDIA_SUBJECT || !policy.readOnly) return filter;
    // Read-only actors (reviewer, anonymous) only see preset media.
    const column =
      table === undefined
        ? 'is_reviewer_preset'
        : `${table}.is_reviewer_preset`;
    const preset = sql<SqlBool>`${sql.ref(column)} = true`;
    return {
      allowed: true,
      where:
        filter.where === null
          ? preset
          : sql<SqlBool>`(${filter.where} and ${preset})`,
    };
  }

  private conditionRowFilter(
    actor: ActorContext,
    action: PermissionAction,
    subject: string,
    table?: string,
  ): RowFilter {
    if (!this.can(actor, action, subject)) return { allowed: false };
    const policy = this.policyOf(actor);
    if (policy.full) return { allowed: true, where: null };

    const grants = this.grantsFor(policy, action, subject);
    if (grants.some((grant) => grant.conditions === null)) {
      return { allowed: true, where: null };
    }
    const catalog = this.subjects.conditionFields(subject, null);
    const conditionActor = this.conditionActor(actor);
    const filters: Expression<SqlBool>[] = [];
    for (const grant of grants) {
      try {
        filters.push(
          compileConditions(grant.conditions, catalog, conditionActor, table),
        );
      } catch (error) {
        if (!(error instanceof InvalidConditionError)) throw error;
      }
    }
    if (filters.length === 0) return { allowed: false };
    return {
      allowed: true,
      where: sql<SqlBool>`(${sql.join(filters, sql` or `)})`,
    };
  }

  private policyOf(actor: ActorContext): EffectivePolicy {
    return effectivePolicy(actor, (subject) =>
      this.subjects.isContentSubject(subject),
    );
  }

  private conditionActor(actor: ActorContext): ConditionActor {
    return {
      id: actor.kind === 'anonymous' ? null : actor.accountId,
      roleRank: actor.role.rank,
    };
  }

  private isActionValid(action: PermissionAction, subject: string): boolean {
    return (
      this.subjects.isKnownSubject(subject) &&
      this.subjects.actionsFor(subject).includes(action)
    );
  }

  /** Actor-kind limits that hold whatever the rows say. */
  private reachable(
    policy: EffectivePolicy,
    action: PermissionAction,
    subject: string,
  ): boolean {
    if (policy.contentOnly && !this.subjects.isContentType(subject)) {
      return false;
    }
    return !(policy.readOnly && action !== PermissionAction.read);
  }

  /** Rows for (action, subject): the slug's own rows, else the `*` rows. */
  private grantsFor(
    policy: EffectivePolicy,
    action: PermissionAction,
    subject: string,
  ): PermissionGrant[] {
    // A create row has no existing row to test conditions against, so a
    // stored one (written before the validator refused them) grants nothing:
    // fail closed.
    const forAction = policy.grants.filter(
      (grant) =>
        grant.action === action &&
        !(action === PermissionAction.create && grant.conditions !== null),
    );
    const own = forAction.filter((grant) => grant.subject === subject);
    if (own.length > 0 || !this.subjects.isContentType(subject)) return own;
    return forAction.filter(
      (grant) => grant.subject === CONTENT_WILDCARD_SUBJECT,
    );
  }

  /** `undefined` = no permission; otherwise the union of the rows' lists. */
  private fieldListFor(
    policy: EffectivePolicy,
    action: PermissionAction,
    subject: string,
    pick: (grant: PermissionGrant) => FieldList,
  ): FieldList | undefined {
    if (!this.isActionValid(action, subject)) return undefined;
    if (!this.reachable(policy, action, subject)) return undefined;
    if (policy.full) return null;
    const grants = this.grantsFor(policy, action, subject);
    if (grants.length === 0) return undefined;
    // Field lists only apply to content types; system subjects are all-or-nothing.
    if (!this.subjects.isContentType(subject)) return null;
    return unionFieldLists(grants.map(pick));
  }
}
