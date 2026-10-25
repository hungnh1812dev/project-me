import { Logger } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import {
  ERROR_CODES,
  INTERNAL_ERROR_MESSAGE,
} from '../../../common/constants/error.constants';
import {
  describeError,
  isDescribableError,
} from '../../../common/http/describe-http-exception';
import {
  GRAPHQL_ERROR_CODES,
  GRAPHQL_MESSAGES,
  ROOT_UNKNOWN_FIELD_PATTERN,
  SUGGESTION_PATTERN,
  VARIABLE_ERROR_PATTERN,
} from '../application/Graphql.constants';

/** Where in the request pipeline an error came from. */
export type GraphqlPhase = 'parse' | 'validate' | 'execute';

export interface FormattedGraphqlError {
  message: string;
  locations?: readonly { line: number; column: number }[];
  path?: readonly (string | number)[];
  extensions: { code: string; details?: unknown; requestId?: string };
}

export interface ErrorFormatOptions {
  phase: GraphqlPhase;
  requestId: string | undefined;
  /** Production: no "Did you mean" suggestions anywhere. */
  shouldStripSuggestions: boolean;
}

const logger = new Logger('GraphQL');
/** Same description as REST; a server error is always `INTERNAL_ERROR` here. */
function fromDescribableError(exception: unknown): {
  code: string;
  message: string;
  details?: unknown;
  isServerError: boolean;
} {
  const described = describeError(exception);
  return {
    code: described.isServerError
      ? ERROR_CODES.INTERNAL_ERROR
      : described.errorCode,
    message: described.message,
    details: described.details,
    isServerError: described.isServerError,
  };
}

const PHASE_CODES = {
  parse: GRAPHQL_ERROR_CODES.PARSE_FAILED,
  validate: GRAPHQL_ERROR_CODES.VALIDATION_FAILED,
} as const;

/** Variable errors name the variable only: the message echoes the value. */
function variableMessage(message: string): string {
  const name = VARIABLE_ERROR_PATTERN.exec(message)?.[1];
  return name === undefined
    ? GRAPHQL_MESSAGES.INVALID_VARIABLES
    : `Variable "$${name}" is not valid.`;
}

function classify(
  error: GraphQLError,
  phase: GraphqlPhase,
): { code: string; message: string; details?: unknown } {
  const original = error.originalError;
  if (isDescribableError(original)) {
    const mapped = fromDescribableError(original);
    if (mapped.isServerError) {
      logger.error(`Resolver failed: ${original.message}`, original.stack);
    }
    return mapped;
  }
  if (original !== undefined && original !== null) {
    // Anything thrown that is not a Nest exception is a bug: log, hide.
    logger.error(
      `Resolver failed: ${original.message}`,
      original instanceof Error ? original.stack : undefined,
    );
    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: INTERNAL_ERROR_MESSAGE,
    };
  }
  if (error.extensions['code'] === GRAPHQL_ERROR_CODES.LIMIT_EXCEEDED) {
    return {
      code: GRAPHQL_ERROR_CODES.LIMIT_EXCEEDED,
      message: error.message,
    };
  }
  if (phase !== 'execute') {
    return { code: PHASE_CODES[phase], message: error.message };
  }
  if (error.path === undefined || error.path.length === 0) {
    // Raised by graphql-js before any field ran: bad variables or operation.
    return {
      code: GRAPHQL_ERROR_CODES.VALIDATION_FAILED,
      message: variableMessage(error.message),
    };
  }
  logger.error(`Execution failed at ${error.path.join('.')}: ${error.message}`);
  return { code: ERROR_CODES.INTERNAL_ERROR, message: INTERNAL_ERROR_MESSAGE };
}

/**
 * The wire shape of one error (docs/modules/graphql.md "Errors"). `details`
 * only for client errors; 5xx-class errors are generic and logged with the
 * request id. Variables are never echoed.
 */
export function formatGraphqlError(
  error: GraphQLError,
  options: ErrorFormatOptions,
): FormattedGraphqlError {
  const { code, message, details } = classify(error, options.phase);
  const extensions: FormattedGraphqlError['extensions'] = { code };
  if (details !== undefined) extensions.details = details;
  if (options.requestId !== undefined) {
    extensions.requestId = options.requestId;
  }
  const formatted: FormattedGraphqlError = {
    // A hint on the Query type could name a type the actor may not see, so
    // those are always stripped; every other hint only in production.
    message:
      options.shouldStripSuggestions || ROOT_UNKNOWN_FIELD_PATTERN.test(message)
        ? message.replace(SUGGESTION_PATTERN, '')
        : message,
    extensions,
  };
  if (error.locations !== undefined) formatted.locations = error.locations;
  if (error.path !== undefined && error.path.length > 0) {
    formatted.path = error.path;
  }
  return formatted;
}
