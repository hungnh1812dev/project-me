import { type FormAlertTone } from '@abyss/form-commons';
import { apiFailureOf, rateLimitedMessage } from '@apis/client/ApiFailure.errors';
import { API_ERROR_CODES, HTTP_STATUS } from '@configs/Http.constants';
import type { ScreenText } from '@configs/locales';
import { isAxiosError } from 'axios';
import type { FieldErrors } from 'react-hook-form';

export interface SaveError {
  message: string;
  tone: FormAlertTone;
  /** A stale version: the page offers "Reload latest version". */
  conflict: boolean;
  /** The items holding the refused field, outermost first; set only for a refused value (CE-6). */
  refusedItems?: RefusedItem[];
}

/** One item on the path of a refused field: its component name and its position in that list. */
export interface RefusedItem {
  componentName: string;
  index: number;
}

const REFUSED_ITEM_PATTERN = /components\.([^.[\]]+)\[(\d+)\]/g;

/**
 * The items named by `details.path` of a `DOCUMENT_INVALID` answer, e.g.
 * `components.experience[1].components.roles[0].values.name`. A path naming no item
 * (a root value, a required list) or no readable path gives none; never the message text.
 */
export function refusedItemPathOf(error: unknown): RefusedItem[] {
  const failure = apiFailureOf(error);
  if (failure.kind !== 'http' || failure.errorCode !== API_ERROR_CODES.DOCUMENT_INVALID) return [];
  const details = (error as { response?: { data?: { details?: { path?: unknown } } } }).response
    ?.data?.details;
  if (typeof details?.path !== 'string') return [];
  return [...details.path.matchAll(REFUSED_ITEM_PATTERN)].map((match) => ({
    componentName: match[1] ?? '',
    index: Number(match[2]),
  }));
}

const ARRAY_INDEX_PATTERN = /^\d+$/;

function isFieldError(node: object): boolean {
  return typeof (node as { type?: unknown }).type === 'string';
}

function itemChainOf(keys: readonly string[]): RefusedItem[] {
  const chain: RefusedItem[] = [];
  keys.forEach((key, position) => {
    const next = keys[position + 1];
    if (next !== undefined && ARRAY_INDEX_PATTERN.test(next) && !ARRAY_INDEX_PATTERN.test(key)) {
      chain.push({ componentName: key, index: Number(next) });
    }
  });
  return chain;
}

function collectRefusedKeyPaths(node: unknown, keys: string[], found: string[][]): void {
  if (node === null || typeof node !== 'object') return;
  if (isFieldError(node)) {
    found.push(keys);
    return;
  }
  for (const [key, child] of Object.entries(node))
    collectRefusedKeyPaths(child, [...keys, key], found);
}

/**
 * The items holding each field the form itself refused (CE-6), one chain per field,
 * outermost first, from react-hook-form's error tree (`experiences.1.roles.0.teamSize`
 * gives `experiences` 1, `roles` 0). A refused root field gives none; no chain is repeated.
 */
export function invalidItemChainsOf(errors: FieldErrors): RefusedItem[][] {
  const keyPaths: string[][] = [];
  collectRefusedKeyPaths(errors, [], keyPaths);
  const chains = new Map<string, RefusedItem[]>();
  for (const chain of keyPaths.map(itemChainOf)) {
    if (chain.length > 0) chains.set(JSON.stringify(chain), chain);
  }
  return [...chains.values()];
}

export function serverMessage(error: unknown): string | undefined {
  if (!isAxiosError(error)) return undefined;
  const message = (error.response?.data as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message !== '' ? message : undefined;
}

/** A failed create / update, reduced to the alert the form shows. */
export function toSaveError(error: unknown, text: ScreenText<'content'>): SaveError {
  const copy = text.content.errors;
  const failure = apiFailureOf(error);
  switch (failure.kind) {
    case 'rate-limited':
      return {
        tone: 'warning',
        conflict: false,
        message: rateLimitedMessage(failure.retryAfterSeconds),
      };
    case 'network':
      return { tone: 'warning', conflict: false, message: copy.network };
    case 'unexpected':
      return { tone: 'error', conflict: false, message: copy.unexpected };
    case 'http': {
      if (failure.errorCode === API_ERROR_CODES.DOCUMENT_VERSION_CONFLICT) {
        return { tone: 'warning', conflict: true, message: copy.conflict };
      }
      if (failure.errorCode === API_ERROR_CODES.DOCUMENT_NOT_MODIFIED) {
        return { tone: 'warning', conflict: false, message: copy.notModified };
      }
      if (failure.status === HTTP_STATUS.FORBIDDEN) {
        return { tone: 'error', conflict: false, message: copy.forbidden };
      }
      if (failure.errorCode === API_ERROR_CODES.DOCUMENT_INVALID) {
        const detail = serverMessage(error);
        return {
          tone: 'error',
          conflict: false,
          message: detail === undefined ? copy.invalidFallback : copy.invalid(detail),
          refusedItems: refusedItemPathOf(error),
        };
      }
      return { tone: 'error', conflict: false, message: copy.unexpected };
    }
  }
}

/** Load failures that mean "not found or not readable" rather than "try again". */
export function isMissing(error: unknown): boolean {
  const failure = apiFailureOf(error);
  return (
    failure.kind === 'http' &&
    (failure.status === HTTP_STATUS.NOT_FOUND || failure.status === HTTP_STATUS.FORBIDDEN)
  );
}
