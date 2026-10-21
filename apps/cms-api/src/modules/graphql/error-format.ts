import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import {
  ERROR_CODE_BY_STATUS,
  ERROR_CODES,
  INTERNAL_ERROR_MESSAGE,
} from '../../common/constants/error.constants';
import {
  GRAPHQL_MESSAGES,
  ROOT_UNKNOWN_FIELD_PATTERN,
  SUGGESTION_PATTERN,
  VARIABLE_ERROR_PATTERN,
} from './graphql.constants';

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
  stripSuggestions: boolean;
}

const logger = new Logger('GraphQL');
const SERVER_ERROR_MIN_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;

interface HttpResponseObject {
  errorCode?: unknown;
  message?: unknown;
  details?: unknown;
}

const isObject = (value: unknown): value is HttpResponseObject =>
  typeof value === 'object' && value !== null;

/** `errorCode` / message / details of a Nest exception, as REST would send them. */
function fromHttpException(exception: HttpException): {
  code: string;
  message: string;
  details?: unknown;
  serverError: boolean;
} {
  const status = exception.getStatus();
  const response = exception.getResponse();
  const serverError = status >= SERVER_ERROR_MIN_STATUS;
  const named = isObject(response) ? response : {};
  const code =
    typeof named.errorCode === 'string'
      ? named.errorCode
      : (ERROR_CODE_BY_STATUS[status] ??
        (serverError ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.HTTP_ERROR));
  const message =
    typeof response === 'string'
      ? response
      : typeof named.message === 'string'
        ? named.message
        : exception.message;
  return {
    code: serverError ? ERROR_CODES.INTERNAL_ERROR : code,
    message: serverError ? INTERNAL_ERROR_MESSAGE : message,
    details: serverError ? undefined : named.details,
    serverError,
  };
}

const PHASE_CODES = {
  parse: ERROR_CODES.GRAPHQL_PARSE_FAILED,
  validate: ERROR_CODES.GRAPHQL_VALIDATION_FAILED,
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
  if (original instanceof HttpException) {
    const mapped = fromHttpException(original);
    if (mapped.serverError) {
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
  if (phase !== 'execute') {
    return { code: PHASE_CODES[phase], message: error.message };
  }
  if (error.path === undefined || error.path.length === 0) {
    // Raised by graphql-js before any field ran: bad variables or operation.
    return {
      code: ERROR_CODES.GRAPHQL_VALIDATION_FAILED,
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
      options.stripSuggestions || ROOT_UNKNOWN_FIELD_PATTERN.test(message)
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
