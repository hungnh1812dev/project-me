import {
  GraphQLError,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  Kind,
  validate,
  type ASTVisitor,
  type DocumentNode,
  type OperationDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from 'graphql';

import { ERROR_CODES } from '../../../common/constants/error.constants';
import {
  GRAPHQL_LIMIT_MESSAGES,
  GRAPHQL_LIMITS,
  INTROSPECTION_ROOT_FIELDS,
  QUERY_TYPE_NAME,
} from '../graphql.constants';

/** Size of a selection set once fragments are expanded. */
interface Shape {
  /** Selected fields (aliases and repeats each count). */
  fields: number;
  /** Deepest field nesting; a field with no children is 1. */
  depth: number;
  /** Fields directly in this set (fragments flattened, children not counted). */
  top: number;
}

const EMPTY: Shape = { fields: 0, depth: 0, top: 0 };

const isIntrospectionRoot = (name: string): boolean =>
  (INTROSPECTION_ROOT_FIELDS as readonly string[]).includes(name);

/**
 * Walks a selection set through fragment spreads and inline fragments.
 * Each fragment is measured once (memoized), so a document of fragments that
 * spread each other twice cannot blow up the walk; a fragment spreading
 * itself counts as empty here (`NoFragmentCyclesRule` reports it).
 */
class ShapeMeter {
  private readonly done = new Map<string, Shape>();
  private readonly active = new Set<string>();

  constructor(private readonly context: ValidationContext) {}

  /** `skipIntrospection` leaves `__schema` / `__type` out (root level only). */
  measure(set: SelectionSetNode, skipIntrospection: boolean): Shape {
    let fields = 0;
    let depth = 0;
    let top = 0;
    for (const selection of set.selections) {
      let part: Shape;
      if (selection.kind === Kind.FIELD) {
        if (skipIntrospection && isIntrospectionRoot(selection.name.value)) {
          continue;
        }
        const child =
          selection.selectionSet === undefined
            ? EMPTY
            : this.measure(selection.selectionSet, false);
        part = {
          fields: 1 + child.fields,
          depth: 1 + child.depth,
          top: 1,
        };
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        part = this.measure(selection.selectionSet, skipIntrospection);
      } else {
        part = this.spread(selection.name.value, skipIntrospection);
      }
      fields += part.fields;
      depth = Math.max(depth, part.depth);
      top += part.top;
    }
    return { fields, depth, top };
  }

  private spread(name: string, skipIntrospection: boolean): Shape {
    // Root-level spreads differ in what they skip, so only nested ones are cached.
    const key = skipIntrospection ? `root:${name}` : name;
    const cached = this.done.get(key);
    if (cached !== undefined) return cached;
    const fragment = this.context.getFragment(name);
    if (fragment == null || this.active.has(key)) return EMPTY;
    this.active.add(key);
    const shape = this.measure(fragment.selectionSet, skipIntrospection);
    this.active.delete(key);
    this.done.set(key, shape);
    return shape;
  }
}

function limitError(
  message: string,
  node: OperationDefinitionNode,
): GraphQLError {
  return new GraphQLError(message, {
    nodes: node,
    extensions: { code: ERROR_CODES.GRAPHQL_LIMIT_EXCEEDED },
  });
}

/** Runs `check` on every operation (each is judged on its own). */
function operationRule(
  check: (
    operation: OperationDefinitionNode,
    meter: ShapeMeter,
  ) => GraphQLError | undefined,
): ValidationRule {
  return (context): ASTVisitor => {
    const meter = new ShapeMeter(context);
    return {
      OperationDefinition(operation) {
        const error = check(operation, meter);
        if (error !== undefined) context.reportError(error);
      },
    };
  };
}

/** Field nesting after fragment expansion (`MAX_DEPTH`). */
export const MaxDepthRule: ValidationRule = operationRule(
  (operation, meter) => {
    const { depth } = meter.measure(operation.selectionSet, true);
    return depth > GRAPHQL_LIMITS.MAX_DEPTH
      ? limitError(GRAPHQL_LIMIT_MESSAGES.DEPTH, operation)
      : undefined;
  },
);

/**
 * Root fields of one operation, aliases and repeats included
 * (`MAX_ROOT_FIELDS`): each one is a full document read.
 */
export const MaxRootFieldsRule: ValidationRule = operationRule(
  (operation, meter) => {
    const { top } = meter.measure(operation.selectionSet, true);
    return top > GRAPHQL_LIMITS.MAX_ROOT_FIELDS
      ? limitError(GRAPHQL_LIMIT_MESSAGES.ROOT_FIELDS, operation)
      : undefined;
  },
);

/** All selected fields after fragment expansion (`MAX_FIELD_NODES`). */
export const MaxFieldNodesRule: ValidationRule = operationRule(
  (operation, meter) => {
    const { fields } = meter.measure(operation.selectionSet, true);
    return fields > GRAPHQL_LIMITS.MAX_FIELD_NODES
      ? limitError(GRAPHQL_LIMIT_MESSAGES.FIELD_NODES, operation)
      : undefined;
  },
);

export const LIMIT_RULES: readonly ValidationRule[] = [
  MaxDepthRule,
  MaxRootFieldsRule,
  MaxFieldNodesRule,
];

/** The limit rules read the document only, so any schema will do. */
const LIMITS_SCHEMA = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: QUERY_TYPE_NAME,
    fields: { _: { type: GraphQLString } },
  }),
});

/**
 * Runs the limit rules alone, before the caller's schema or the access
 * policy is even loaded: an over-limit document costs no database work.
 */
export function findLimitViolations(
  document: DocumentNode,
): readonly GraphQLError[] {
  return validate(LIMITS_SCHEMA, document, [...LIMIT_RULES]);
}
