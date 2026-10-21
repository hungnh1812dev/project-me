import { GraphQLError, type ASTVisitor, type ValidationContext } from 'graphql';

import {
  GRAPHQL_MESSAGES,
  ROOT_FIELD_EXTENSION_KEY,
} from '../graphql.constants';
import type { RootFieldExtension } from '../graphql.constants';

/**
 * Hidden = unknown (SPEC D18, as in REST T17b): a root field of a content
 * type the actor cannot read is reported with exactly the text and shape of
 * an unknown field, so the response never tells a hidden type from a typo.
 * `canRead(slug)` is the access layer's answer (`rowFilter(...).allowed`);
 * this module never looks at roles.
 */
export function ContentTypeVisibilityRule(
  canRead: (slug: string) => boolean,
): (context: ValidationContext) => ASTVisitor {
  return (context) => ({
    Field(node) {
      const parent = context.getParentType();
      if (parent === null || parent === undefined) return;
      if (parent !== context.getSchema().getQueryType()) return;
      const extension = parent.getFields()[node.name.value]?.extensions[
        ROOT_FIELD_EXTENSION_KEY
      ] as RootFieldExtension | undefined;
      if (extension === undefined || canRead(extension.slug)) return;
      context.reportError(
        new GraphQLError(
          GRAPHQL_MESSAGES.UNKNOWN_QUERY_FIELD(node.name.value),
          {
            nodes: node,
          },
        ),
      );
    },
  });
}
