import { DomainError } from '../../../common/errors/Domain.errors';
import { DOMAIN_ERROR_KINDS } from '../../../common/errors/DomainErrorKinds.constants';
import type { PageMeta } from '../../../common/validation/SharedSchemas.rules';
import {
  MEDIA_ERROR_CODES,
  MEDIA_ERROR_MESSAGES,
  MEDIA_REF_ERROR_CODES,
  mediaRefInvalidMessage,
} from './Media.constants';

/** A library file row: the fields the API may show, in the storage's own names. */
export interface MediaRecord {
  readonly documentId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string | null;
  readonly url: string;
  readonly thumbnailUrl: string | null;
  readonly provider: string;
  readonly isReviewerPreset: boolean;
  readonly createdAt: Date;
}

/** A library file as the API returns it: no storage key, no internal id. */
export interface MediaView {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly alt: string | null;
  readonly url: string;
  readonly thumbnailUrl: string | null;
  readonly provider: string;
  readonly isReviewerPreset: boolean;
  readonly createdAt: string;
}

export interface MediaPage<T = MediaRecord> {
  readonly data: readonly T[];
  readonly meta: PageMeta;
}

/** A file as a document read embeds it. The internal integer id is never part of it. */
export interface EmbeddedMedia {
  readonly id: string;
  readonly fileName: string;
  readonly url: string;
  readonly thumbnailUrl: string | null;
  readonly provider: string;
  readonly alt: string | null;
  readonly size: number;
  readonly createdAt: string;
}

/** 403 with the default body: the actor may not use the library this way at all. */
export const mediaForbidden = () =>
  new DomainError({ kind: DOMAIN_ERROR_KINDS.FORBIDDEN });

/** Unknown, deleted and out-of-scope files all answer the same. */
export const mediaNotFound = () =>
  new DomainError({
    kind: DOMAIN_ERROR_KINDS.NOT_FOUND,
    errorCode: MEDIA_ERROR_CODES.NOT_FOUND,
    message: MEDIA_ERROR_MESSAGES.NOT_FOUND,
  });

export const mediaInUse = () =>
  new DomainError({
    kind: DOMAIN_ERROR_KINDS.CONFLICT,
    errorCode: MEDIA_ERROR_CODES.IN_USE,
    message: MEDIA_ERROR_MESSAGES.IN_USE,
  });

/** A document points a media field at a file the writer cannot use. */
export const mediaRefInvalid = (inputPath: string) =>
  new DomainError({
    kind: DOMAIN_ERROR_KINDS.INVALID_INPUT,
    errorCode: MEDIA_REF_ERROR_CODES.INVALID,
    message: mediaRefInvalidMessage(inputPath),
  });
