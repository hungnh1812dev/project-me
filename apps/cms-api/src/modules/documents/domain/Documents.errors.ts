import { ERROR_CODES } from '../../../common/constants/error.constants';
import {
  DomainError,
  DOMAIN_ERROR_KINDS,
} from '../../../common/errors/Domain.errors';
import { ContentTreeError, DocumentNotFoundError } from '../../content-engine';
import {
  BULK_MESSAGES,
  DOCUMENT_ERROR_CODES,
  DOCUMENT_ERROR_MESSAGES,
  PRESENCE_MESSAGES,
} from './Documents.constants';

const { INVALID_INPUT, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED } =
  DOMAIN_ERROR_KINDS;

/** 403 with the default body: the actor may not do this at all. */
export const forbidden = () => new DomainError({ kind: FORBIDDEN });

/** 404 with the default body: the slug is not a registered content type. */
export const unknownContentType = () => new DomainError({ kind: NOT_FOUND });

export const documentNotFound = () =>
  new DomainError({
    kind: NOT_FOUND,
    errorCode: DOCUMENT_ERROR_CODES.NOT_FOUND,
    message: DOCUMENT_ERROR_MESSAGES.NOT_FOUND,
  });

export const draftsForbidden = () =>
  new DomainError({
    kind: FORBIDDEN,
    message: DOCUMENT_ERROR_MESSAGES.DRAFTS_FORBIDDEN,
  });

export const notPublishable = () =>
  new DomainError({
    kind: INVALID_INPUT,
    errorCode: DOCUMENT_ERROR_CODES.NOT_PUBLISHABLE,
    message: DOCUMENT_ERROR_MESSAGES.NOT_PUBLISHABLE,
  });

export const invalidBody = () =>
  new DomainError({
    kind: INVALID_INPUT,
    errorCode: ERROR_CODES.BAD_REQUEST,
    message: DOCUMENT_ERROR_MESSAGES.INVALID_BODY,
  });

export const versionConflict = (message: string, details: unknown) =>
  new DomainError({
    kind: CONFLICT,
    errorCode: DOCUMENT_ERROR_CODES.VERSION_CONFLICT,
    message,
    details,
  });

export const bulkNotCollection = () =>
  new DomainError({
    kind: INVALID_INPUT,
    errorCode: DOCUMENT_ERROR_CODES.BULK_NOT_COLLECTION,
    message: DOCUMENT_ERROR_MESSAGES.BULK_NOT_COLLECTION,
  });

export const tooManyComponentRows = () =>
  new DomainError({
    kind: INVALID_INPUT,
    errorCode: DOCUMENT_ERROR_CODES.BULK_LIMIT,
    message: BULK_MESSAGES.TOO_MANY_COMPONENT_ROWS,
  });

export const presenceStoreFull = () =>
  new DomainError({
    kind: RATE_LIMITED,
    message: PRESENCE_MESSAGES.STORE_FULL,
  });

/**
 * The one owner of how the content engine's errors reach a client: a tree
 * rejected while writing (unknown uid, ...) is the client's fault (400); a row
 * that vanished before it was locked (a concurrent delete) is a 404.
 */
export async function mapContentErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ContentTreeError) {
      throw new DomainError({
        kind: INVALID_INPUT,
        errorCode: error.code,
        message: error.message,
      });
    }
    if (error instanceof DocumentNotFoundError) throw documentNotFound();
    throw error;
  }
}
