import { Injectable } from '@nestjs/common';
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from 'graphql';

import { ContentRegistryProvider } from '../content-engine';
import type { ContentTypeDefinition } from '../content-engine';
import { DocumentsQueryService } from '../documents';
import { attachDocumentResolvers } from './document.resolvers';
import {
  GRAPHQL_LIMITS,
  NO_READABLE_TYPES_FIELD,
  QUERY_TYPE_NAME,
} from './graphql.constants';
import { buildGraphqlSchema } from './schema/schema.builder';

const KEY_SEPARATOR = '\u0000';

/**
 * The schema each caller validates against (SPEC D18). It holds only the
 * content types the caller can read, so a hidden type is not hidden by a
 * rule but absent: graphql-js itself then answers "unknown field" (and
 * "unknown type") with the same errors, count and locations as for a name
 * that never existed. Schemas are cached by the set of readable slugs
 * (bounded; beyond the bound one is built per request). Built lazily from
 * the content registry, so boot works with the database down; a failed
 * build is not cached.
 */
@Injectable()
export class GraphqlSchemaProvider {
  private definitions: Promise<ContentTypeDefinition[]> | undefined;
  private readonly cache = new Map<string, GraphQLSchema>();

  constructor(
    private readonly registry: ContentRegistryProvider,
    private readonly documents: DocumentsQueryService,
  ) {}

  /** The schema of the types for which `canRead(slug)` holds. */
  async schemaFor(canRead: (slug: string) => boolean): Promise<GraphQLSchema> {
    const visible = (await this.loadDefinitions())
      .filter((definition) => canRead(definition.slug))
      .map((definition) => definition.slug)
      .sort();
    const key = visible.join(KEY_SEPARATOR);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const built = await this.build(visible);
    if (this.cache.size < GRAPHQL_LIMITS.MAX_CACHED_SCHEMAS) {
      this.cache.set(key, built);
    }
    return built;
  }

  private loadDefinitions(): Promise<ContentTypeDefinition[]> {
    this.definitions ??= this.registry
      .registry()
      .then((registry) =>
        registry.slugs().map((slug) => registry.resolve(slug).definition),
      )
      .catch((error: unknown) => {
        this.definitions = undefined;
        throw error;
      });
    return this.definitions;
  }

  private async build(slugs: readonly string[]): Promise<GraphQLSchema> {
    const wanted = new Set(slugs);
    const definitions = (await this.loadDefinitions()).filter((definition) =>
      wanted.has(definition.slug),
    );
    if (definitions.length === 0) {
      // A Query type needs one field; nothing is readable, so only this
      // placeholder (never resolved, no content behind it) exists.
      return new GraphQLSchema({
        query: new GraphQLObjectType({
          name: QUERY_TYPE_NAME,
          fields: { [NO_READABLE_TYPES_FIELD]: { type: GraphQLString } },
        }),
      });
    }
    return attachDocumentResolvers(
      buildGraphqlSchema(definitions),
      this.documents,
    );
  }
}
