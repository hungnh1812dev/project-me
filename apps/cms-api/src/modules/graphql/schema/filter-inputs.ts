import {
  GraphQLBoolean,
  GraphQLID,
  GraphQLInputObjectType,
  type GraphQLInputFieldConfigMap,
  type GraphQLInputType,
  type GraphQLNullableInputType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLString,
} from 'graphql';

import { type ConditionValueKind } from '../../access';
import type { FilterClause, SortDirection, SortKey } from '../../documents';
import {
  FILTER_OPERATORS,
  type FilterOperator,
  OPERATORS_BY_KIND,
} from '../../documents';
import { FILTER_INPUT_NAMES } from '../graphql.constants';
import { DateScalar, DateTimeScalar, DecimalScalar } from './scalars';

/** GraphQL type of the value each kind compares with. */
const OPERAND_TYPES: Readonly<
  Record<ConditionValueKind, GraphQLNullableInputType>
> = {
  string: GraphQLString,
  integer: GraphQLInt,
  decimal: DecimalScalar,
  date: DateScalar,
  datetime: DateTimeScalar,
  boolean: GraphQLBoolean,
  uuid: GraphQLID,
};

/** `contains` is a substring match, so its operand is text whatever the kind. */
const SET_OPERATOR = 'in';
const TEXT_OPERATOR = 'contains';

function operandType(
  kind: ConditionValueKind,
  operator: FilterOperator,
): GraphQLInputType {
  if (operator === TEXT_OPERATOR) return GraphQLString;
  const operand = OPERAND_TYPES[kind];
  return operator === SET_OPERATOR
    ? new GraphQLList(new GraphQLNonNull(operand))
    : operand;
}

function filterInputFor(kind: ConditionValueKind): GraphQLInputObjectType {
  const fields: GraphQLInputFieldConfigMap = {};
  for (const operator of OPERATORS_BY_KIND[kind]) {
    fields[operator] = { type: operandType(kind, operator) };
  }
  return new GraphQLInputObjectType({
    name: FILTER_INPUT_NAMES[kind],
    fields,
  });
}

const KINDS = Object.keys(FILTER_INPUT_NAMES) as ConditionValueKind[];

/** One input per REST operator set, operators read from `OPERATORS_BY_KIND`. */
export const FILTER_INPUTS: Readonly<
  Record<ConditionValueKind, GraphQLInputObjectType>
> = Object.fromEntries(
  KINDS.map((kind) => [kind, filterInputFor(kind)]),
) as Record<ConditionValueKind, GraphQLInputObjectType>;

const OPERATOR_SET: ReadonlySet<string> = new Set(FILTER_OPERATORS);

/**
 * The REST `FilterClause`s of a `<Root>Filter` argument: one per operator,
 * values stringified like URL values, so REST's typing, `QueryGuard` and
 * limits apply unchanged. An operator given as `null` is as if absent.
 */
export function filterToClauses(
  filter: Readonly<Record<string, unknown>> | null | undefined,
): FilterClause[] {
  const clauses: FilterClause[] = [];
  for (const [path, operators] of Object.entries(filter ?? {})) {
    if (operators === null || typeof operators !== 'object') continue;
    for (const [op, operand] of Object.entries(operators)) {
      if (!OPERATOR_SET.has(op) || operand === null || operand === undefined) {
        continue;
      }
      const values: unknown[] = Array.isArray(operand) ? operand : [operand];
      clauses.push({
        path,
        op: op as FilterOperator,
        values: values.map(String),
      });
    }
  }
  return clauses;
}

/** The REST `SortKey`s of a `[<Root>Sort!]` argument (enum values are the paths). */
export function sortToKeys(
  sort:
    | readonly { field: string; direction?: SortDirection | null }[]
    | null
    | undefined,
): SortKey[] {
  return (sort ?? []).map(({ field, direction }) => ({
    path: field,
    direction: direction ?? 'asc',
  }));
}
