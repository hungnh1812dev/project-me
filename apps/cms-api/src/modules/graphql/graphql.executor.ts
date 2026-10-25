import { Inject, Injectable } from '@nestjs/common';
import {
  type DocumentNode,
  execute,
  GraphQLError,
  NoSchemaIntrospectionCustomRule,
  parse,
  specifiedRules,
  validate,
} from 'graphql';

import { type IAppConfig } from '../../config/app-config';
import { APP_CONFIG } from '../../config/config.constants';
import {
  AccessPolicyService,
  PermissionAction,
  type ActorContext,
} from '../access';
import type { GraphqlContext } from './http/Document.resolver';
import {
  type FormattedGraphqlError,
  formatGraphqlError,
  type GraphqlPhase,
} from './http/GraphqlError.filter';
import {
  GRAPHQL_ERROR_CODES,
  GRAPHQL_LIMIT_MESSAGES,
  GRAPHQL_LIMITS,
  TOKEN_LIMIT_PATTERN,
} from './application/Graphql.constants';
import { GraphqlSchemaProvider } from './graphql.schema.provider';
import { findLimitViolations } from './http/rules/Limits.rules';
import { ContentTypeVisibilityRule } from './http/rules/Visibility.rules';

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
