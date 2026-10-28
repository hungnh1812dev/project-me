import { Inject, Injectable } from '@nestjs/common';
import {
  type DocumentNode,
  execute,
  GraphQLError,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
} from 'graphql';

import { type IAppConfig } from '../../../config/AppConfig.setup';
import { APP_CONFIG } from '../../../config/Config.constants';
import {
  AccessPolicyService,
  PermissionAction,
  type ActorContext,
} from '../../access';
import { ContentRegistry } from '../../content-engine';
import type { ContentTypeDefinition } from '../../content-engine';
import { DocumentsQueryService } from '../../documents';
import {
  attachDocumentResolvers,
  type GraphqlContext,
} from './Document.resolver';
import {
  type FormattedGraphqlError,
  formatGraphqlError,
  type GraphqlPhase,
} from './GraphqlError.filter';
import { findLimitViolations } from './rules/Limits.rules';
import { ContentTypeVisibilityRule } from './rules/Visibility.rules';
import { buildGraphqlSchema } from './schema/SchemaBuilder.rules';
import {
  GRAPHQL_ERROR_CODES,
  GRAPHQL_LIMIT_MESSAGES,
  GRAPHQL_LIMITS,
  NO_READABLE_TYPES_FIELD,
  QUERY_TYPE_NAME,
  TOKEN_LIMIT_PATTERN,
} from '../application/Graphql.constants';

export interface GraphqlRequest {
  query: string;
  variables?: Record<string, unknown> | null | undefined;
  operationName?: string | null | undefined;
}

export interface GraphqlResponse {
  /** 400 before execution started (no `data` key), 200 after. */
  status: number;
  body: { data?: unknown; errors?: FormattedGraphqlError[] };
}

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;

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
    private readonly registry: ContentRegistry,
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

/**
 * parse -> validate -> execute (docs/modules/graphql.md "Request pipeline").
 * Validation runs against the caller's own schema (only readable types), so
 * a hidden type is exactly an unknown one: same errors, count and locations.
 * The visibility rule stays as a second line of defence.
 */
@Injectable()
export class GraphqlExecutor {
  constructor(
    private readonly schemas: GraphqlSchemaProvider,
    private readonly access: AccessPolicyService,
    @Inject(APP_CONFIG) private readonly config: IAppConfig,
  ) {}

  async run(
    actor: ActorContext,
    request: GraphqlRequest,
    requestId: string | undefined,
  ): Promise<GraphqlResponse> {
    const fail = (phase: GraphqlPhase, errors: readonly GraphQLError[]) => ({
      status: HTTP_BAD_REQUEST,
      body: {
        errors: errors.map((error) =>
          formatGraphqlError(error, {
            phase,
            requestId,
            shouldStripSuggestions: this.config.isProduction,
          }),
        ),
      },
    });

    let document: DocumentNode;
    try {
      document = parse(request.query, { maxTokens: GRAPHQL_LIMITS.MAX_TOKENS });
    } catch (error) {
      return fail('parse', [toParseError(error)]);
    }

    // Over a limit: answered before the access policy or any schema is loaded.
    const overLimit = findLimitViolations(document);
    if (overLimit.length > 0) return fail('validate', overLimit);

    const { evaluator } = await this.access.policy();
    const canRead = (slug: string) =>
      evaluator.rowFilter(actor, PermissionAction.read, slug).allowed;
    const schema = await this.schemas.schemaFor(canRead);
    const invalid = validate(schema, document, [
      ...specifiedRules,
      ContentTypeVisibilityRule(canRead),
      ...(this.config.isProduction ? [NoSchemaIntrospectionCustomRule] : []),
    ]);
    if (invalid.length > 0) return fail('validate', invalid);

    const contextValue: GraphqlContext = { actor };
    const executionResult = await execute({
      schema,
      document,
      variableValues: request.variables ?? undefined,
      operationName: request.operationName ?? undefined,
      contextValue,
    });
    const phase: GraphqlPhase = 'execute';
    const errors = executionResult.errors?.map((error) =>
      formatGraphqlError(error, {
        phase,
        requestId,
        shouldStripSuggestions: this.config.isProduction,
      }),
    );
    if (!('data' in executionResult) || executionResult.data === undefined) {
      // Variables or operation rejected before any field ran.
      return {
        status: HTTP_BAD_REQUEST,
        body: errors === undefined ? {} : { errors },
      };
    }
    return {
      status: HTTP_OK,
      body:
        errors === undefined
          ? { data: executionResult.data }
          : { data: executionResult.data, errors },
    };
  }
}

/** The parser's `maxTokens` abort is a limit error, not a syntax error. */
function toParseError(error: unknown): GraphQLError {
  if (!(error instanceof GraphQLError)) return new GraphQLError(String(error));
  if (!TOKEN_LIMIT_PATTERN.test(error.message)) return error;
  return new GraphQLError(GRAPHQL_LIMIT_MESSAGES.TOKENS, {
    extensions: { code: GRAPHQL_ERROR_CODES.LIMIT_EXCEEDED },
  });
}
