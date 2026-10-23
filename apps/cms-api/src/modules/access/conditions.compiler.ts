import { type Expression, type RawBuilder, sql, type SqlBool } from 'kysely';
import { z } from 'zod';

import {
  parseDate,
  parseDatetime,
  fieldTypeOf,
  parseUuid,
  type FieldValueKind,
} from '../content-engine';
import {
  ACCESS_ERROR_CODES,
  CONDITION_LIMITS,
  CONDITION_OPERATORS,
  CONDITION_SYSTEM_FIELDS,
  CONDITION_VARIABLE_PREFIX,
  CONDITION_VARIABLES,
} from './access.constants';

/**
 * Conditions DSL (SPEC §8.3): a whitelisted JSON shape that is validated
 * when a permission is saved and compiled to parameterized SQL only.
 * Field names map to columns through a catalog built from the content
 * engine's table plan; a value is either a literal (sent as a bind
 * parameter) or one of the two actor variables. Nothing from the DSL is
 * ever spliced into SQL text: columns go through `sql.ref` and only names
 * the catalog produced can reach it.
 */

export type ConditionLiteral = string | number | boolean | null;
export type ConditionValue = ConditionLiteral | ConditionLiteral[];

export interface ConditionClause {
  field: string;
  op: (typeof CONDITION_OPERATORS)[number];
  value: ConditionValue;
}

export interface ConditionSet {
  all: ConditionClause[];
}

/** What a value is compared as; decides which literals and variables are valid. */
export type ConditionValueKind = FieldValueKind;

export interface ConditionField {
  column: string;
  kind: ConditionValueKind;
}

/** DSL field name -> column; `undefined` = not allowed in a condition. */
export type ConditionFieldCatalog = (
  field: string,
) => ConditionField | undefined;

/** Values the actor variables resolve to (SPEC §8.3). */
export interface ConditionActor {
  /** Account id (token: the creator's; reviewer: the ephemeral account's). Null = none. */
  id: number | null;
  roleRank: number;
}

export interface ConditionIssue {
  code: typeof ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION;
  /** Path inside the conditions JSON, e.g. `['all', 0, 'value']`. */
  path: (string | number)[];
  message: string;
}

export type ConditionValidation =
  | { ok: true; conditions: ConditionSet }
  | { ok: false; issues: ConditionIssue[] };

export class InvalidConditionError extends Error {
  readonly code = ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION;

  constructor(readonly issues: ConditionIssue[]) {
    super(
      `Invalid permission condition: ${issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
    this.name = 'InvalidConditionError';
  }
}

const literalSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const conditionSetSchema = z.strictObject({
  all: z
    .array(
      z.strictObject({
        field: z.string(),
        op: z.enum(CONDITION_OPERATORS),
        value: z.union([literalSchema, z.array(literalSchema)]),
      }),
    )
    .min(1)
    .max(CONDITION_LIMITS.MAX_CLAUSES),
});

/** Content field type -> comparison kind; `undefined` = not usable in a condition. */
export function conditionKindOf(type: string): ConditionValueKind | undefined {
  return fieldTypeOf(type)?.conditionKind ?? undefined;
}

/** The root system columns every subject's conditions may use (decision T14). */
export function systemConditionField(
  field: string,
): ConditionField | undefined {
  if (!Object.hasOwn(CONDITION_SYSTEM_FIELDS, field)) return undefined;
  return CONDITION_SYSTEM_FIELDS[field as keyof typeof CONDITION_SYSTEM_FIELDS];
}

const NUMERIC_KINDS: readonly ConditionValueKind[] = ['integer', 'decimal'];
const VARIABLE_NAMES: readonly string[] = Object.values(CONDITION_VARIABLES);

function literalProblem(
  value: ConditionLiteral,
  kind: ConditionValueKind,
): string | undefined {
  if (
    typeof value === 'string' &&
    value.startsWith(CONDITION_VARIABLE_PREFIX)
  ) {
    if (!VARIABLE_NAMES.includes(value)) {
      return `unknown variable "${value}" (allowed: ${VARIABLE_NAMES.join(', ')})`;
    }
    // Both variables are integers.
    return NUMERIC_KINDS.includes(kind)
      ? undefined
      : `variable "${value}" cannot be compared with a ${kind} field`;
  }
  if (value === null) return undefined;
  switch (kind) {
    case 'string':
      return typeof value === 'string' &&
        value.length <= CONDITION_LIMITS.MAX_STRING_LENGTH
        ? undefined
        : `expected a string of at most ${CONDITION_LIMITS.MAX_STRING_LENGTH} characters`;
    case 'integer':
      return Number.isSafeInteger(value) ? undefined : 'expected an integer';
    case 'decimal':
      return typeof value === 'number' && Number.isFinite(value)
        ? undefined
        : 'expected a number';
    case 'boolean':
      return typeof value === 'boolean' ? undefined : 'expected a boolean';
    case 'date':
      return typeof value === 'string' && parseDate(value) !== undefined
        ? undefined
        : 'expected a date (YYYY-MM-DD)';
    case 'datetime':
      return typeof value === 'string' && parseDatetime(value) !== undefined
        ? undefined
        : 'expected an ISO date-time';
    case 'uuid':
      return typeof value === 'string' && parseUuid(value) !== undefined
        ? undefined
        : 'expected a UUID';
    default: {
      // A kind added without a literal rule rejects every literal.
      const unreachable: never = kind;
      return `unsupported field kind "${String(unreachable)}"`;
    }
  }
}

/**
 * Checks raw JSON against the DSL: shape, operators, fields (via the
 * catalog), literal types and variables. Call it when a permission is saved
 * (T17); the compiler runs it again so a hand-edited row fails closed.
 */
export function validateConditions(
  raw: unknown,
  catalog: ConditionFieldCatalog,
): ConditionValidation {
  const issue = (
    path: (string | number)[],
    message: string,
  ): ConditionIssue => ({
    code: ACCESS_ERROR_CODES.PERMISSION_INVALID_CONDITION,
    path,
    message,
  });

  const parsed = conditionSetSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((zodIssue) =>
        issue(
          zodIssue.path.filter(
            (segment): segment is string | number =>
              typeof segment !== 'symbol',
          ),
          zodIssue.message,
        ),
      ),
    };
  }

  const issues: ConditionIssue[] = [];
  parsed.data.all.forEach((clause, index) => {
    const at = ['all', index];
    const field = catalog(clause.field);
    if (field === undefined) {
      issues.push(
        issue(
          [...at, 'field'],
          `field "${clause.field}" cannot be used in a condition`,
        ),
      );
      return;
    }
    if (clause.op === 'in') {
      if (!Array.isArray(clause.value)) {
        issues.push(issue([...at, 'value'], '"in" expects an array'));
        return;
      }
      if (
        clause.value.length === 0 ||
        clause.value.length > CONDITION_LIMITS.MAX_IN_VALUES
      ) {
        issues.push(
          issue(
            [...at, 'value'],
            `"in" expects 1 to ${CONDITION_LIMITS.MAX_IN_VALUES} values`,
          ),
        );
        return;
      }
      clause.value.forEach((value, valueIndex) => {
        const problem =
          value === null
            ? '"in" values cannot be null'
            : literalProblem(value, field.kind);
        if (problem !== undefined) {
          issues.push(issue([...at, 'value', valueIndex], problem));
        }
      });
      return;
    }
    if (Array.isArray(clause.value)) {
      issues.push(issue([...at, 'value'], `"${clause.op}" expects one value`));
      return;
    }
    const problem = literalProblem(clause.value, field.kind);
    if (problem !== undefined) issues.push(issue([...at, 'value'], problem));
  });

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, conditions: parsed.data };
}

function resolve(value: ConditionLiteral, actor: ConditionActor) {
  if (value === CONDITION_VARIABLES.ACTOR_ID) return actor.id;
  if (value === CONDITION_VARIABLES.ACTOR_ROLE_RANK) return actor.roleRank;
  return value;
}

function compileClause(
  clause: ConditionClause,
  field: ConditionField,
  actor: ConditionActor,
  table: string | undefined,
): RawBuilder<SqlBool> {
  const column = sql.ref(
    table === undefined ? field.column : `${table}.${field.column}`,
  );
  if (Array.isArray(clause.value)) {
    const values = clause.value.map((value) => sql.val(resolve(value, actor)));
    return sql<SqlBool>`${column} in (${sql.join(values)})`;
  }
  // Only a literal null means "IS NULL". A variable that resolves to null
  // (an actor without an id) stays a bind parameter, so `= NULL` matches no
  // row instead of every row nobody created.
  const literalNull = clause.value === null;
  const value = resolve(clause.value, actor);
  if (clause.op === 'eq') {
    return literalNull
      ? sql<SqlBool>`${column} is null`
      : sql<SqlBool>`${column} = ${value}`;
  }
  // `ne` keeps rows whose column is NULL (they are not equal to the value).
  return literalNull
    ? sql<SqlBool>`${column} is not null`
    : sql<SqlBool>`${column} is distinct from ${value}`;
}

/**
 * Compiles a condition set to a parameterized boolean SQL expression for a
 * Kysely `where`. `table` qualifies the columns when the query joins.
 * @throws InvalidConditionError when the conditions do not validate.
 */
export function compileConditions(
  raw: unknown,
  catalog: ConditionFieldCatalog,
  actor: ConditionActor,
  table?: string,
): Expression<SqlBool> {
  const result = validateConditions(raw, catalog);
  if (!result.ok) throw new InvalidConditionError(result.issues);
  const clauses = result.conditions.all.map((clause) => {
    const field = catalog(clause.field);
    if (field === undefined) throw new InvalidConditionError([]);
    return compileClause(clause, field, actor, table);
  });
  return sql<SqlBool>`(${sql.join(clauses, sql` and `)})`;
}
