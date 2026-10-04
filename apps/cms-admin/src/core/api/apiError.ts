import axios, { AxiosError } from 'axios';

export interface ApiErrorInit {
  status: number;
  message: string;
  messages?: string[];
  code?: string;
  body?: unknown;
}

/**
 * The one error shape every API failure is normalized to. `status` is the HTTP status, or 0 when
 * no response arrived (network error, timeout, or a non-HTTP throw).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly messages: string[];
  readonly code?: string;
  readonly body?: unknown;

  constructor({ status, message, messages, code, body }: ApiErrorInit) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.messages = messages ?? [message];
    this.code = code;
    this.body = body;
  }
}

const NETWORK_MESSAGE = 'Cannot reach the server. Check your connection and try again.';
const TIMEOUT_MESSAGE = 'The request timed out. Try again.';
const UNKNOWN_MESSAGE = 'Something went wrong.';
const TIMEOUT_CODES = new Set<string>([AxiosError.ECONNABORTED, AxiosError.ETIMEDOUT]);

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Reads a Nest error envelope's `message` (string or string[]) into a list of messages. */
function nestMessages(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || !('message' in body)) return [];
  const { message } = body;
  if (typeof message === 'string') return message ? [message] : [];
  if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string');
  return [];
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;

  if (axios.isAxiosError(error)) {
    const { response, code } = error;
    if (!response) {
      const message = code && TIMEOUT_CODES.has(code) ? TIMEOUT_MESSAGE : NETWORK_MESSAGE;
      return new ApiError({ status: 0, message, code });
    }
    const messages = nestMessages(response.data);
    const list = messages.length > 0 ? messages : [`Request failed with status ${response.status}`];
    return new ApiError({
      status: response.status,
      message: list.join(', '),
      messages: list,
      code,
      body: response.data,
    });
  }

  if (error instanceof Error) {
    return new ApiError({ status: 0, message: error.message || UNKNOWN_MESSAGE });
  }
  return new ApiError({ status: 0, message: UNKNOWN_MESSAGE, body: error });
}
